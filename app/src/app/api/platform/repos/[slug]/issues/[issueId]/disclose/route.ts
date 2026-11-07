import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform/config";
import { JsonRpcNearChain } from "@/lib/platform/launch/near-chain";
import { handlePlatformError, platformError } from "@/lib/platform/http";
import { IndexerService } from "@/lib/platform/indexer";
import { isTrustedRequest } from "@/lib/platform/request";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { getViewerContext, isBoardMaintainer } from "@/lib/platform/viewer";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const GHSA_RE = /^GHSA(-[A-Z0-9]{4}){3}$/i;
const HANDLE_RE = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

function privateRefFor(ghsaId: string): string {
  return createHash("sha256").update(ghsaId.trim().toUpperCase()).digest("hex");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; issueId: string }> },
) {
  try {
    if (!isTrustedRequest(request)) return platformError(403, "Cross-site request rejected");
    await requireSession();
    const { slug, issueId: rawIssueId } = await context.params;
    const issueId = Number(rawIssueId);
    if (!Number.isInteger(issueId) || issueId < 0) return platformError(400, "Invalid bounty ID");

    const store = await getPlatformStore();
    const repository = store.getRepositoryBySlug(slug);
    if (!repository || repository.isPrivate) return platformError(404, "Repository not found");
    const deployment = store.getDeploymentByRepositoryId(repository.id);
    if (!deployment || deployment.status !== "active") {
      return platformError(409, "Repository has no active board");
    }
    const board = store.getBoard(deployment.boardAccount);
    const issue = store.getIssue(deployment.boardAccount, issueId);
    if (!issue || issue.kind !== "PrivateSecurity") return platformError(404, "Private bounty not found");

    const viewer = await getViewerContext(store);
    if (!viewer.signedIn) return platformError(401, "Sign in to continue");
    if (!isBoardMaintainer(board, viewer.nearAccount)) {
      return platformError(403, "Only a board maintainer can disclose this advisory");
    }
    if (issue.status !== "Approved") {
      return platformError(409, "The private bounty must be approved before disclosure");
    }
    if (issue.security) return platformError(409, "This advisory is already disclosed");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const ghsaId = typeof body?.ghsaId === "string" ? body.ghsaId.trim().toUpperCase() : "";
    const researcherGithub =
      typeof body?.researcherGithub === "string"
        ? body.researcherGithub.trim().replace(/^@/, "").toLowerCase()
        : "";
    const advisoryUrl = typeof body?.advisoryUrl === "string" ? body.advisoryUrl.trim() : "";
    if (!GHSA_RE.test(ghsaId)) return platformError(400, "Enter a valid GHSA ID");
    if (!HANDLE_RE.test(researcherGithub)) return platformError(400, "Enter a valid GitHub handle");
    if (!advisoryUrl.startsWith("https://") || /\s/.test(advisoryUrl)) {
      return platformError(400, "Advisory URL must be an https URL without spaces");
    }
    if (privateRefFor(ghsaId) !== issue.privateRef) {
      return platformError(400, "The GHSA ID does not match this private bounty");
    }

    const config = getPlatformConfig();
    if (!config.near.oraclePrivateKey) {
      return platformError(500, "The oracle key is not configured");
    }
    const chain = new JsonRpcNearChain({
      rpcUrl: config.rpcUrl,
      deployerAccount: config.near.deployerAccount,
      deployerPrivateKey: config.near.deployerPrivateKey,
    });
    const txHash = String(
      await chain.call(
        deployment.oracleAccount,
        config.near.oraclePrivateKey,
        deployment.boardAccount,
        "mark_security_fixed",
        {
          private_ref: issue.privateRef,
          ghsa_id: ghsaId,
          researcher_github: researcherGithub,
          advisory_url: advisoryUrl,
        },
      ),
    );
    const indexer = await new IndexerService(store, config).tick();
    return NextResponse.json({ txHash, indexer });
  } catch (error) {
    return handlePlatformError(error);
  }
}
