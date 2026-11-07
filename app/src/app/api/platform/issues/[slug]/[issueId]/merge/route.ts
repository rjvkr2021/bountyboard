import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform/config";
import { ContributionService } from "@/lib/platform/contribute/service";
import { ContributeError } from "@/lib/platform/contribute/errors";
import { getGithubIdentity } from "@/lib/platform/identity/github";
import { handlePlatformError } from "@/lib/platform/http";
import { IndexerService } from "@/lib/platform/indexer";
import { isTrustedRequest } from "@/lib/platform/request";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; issueId: string }> },
) {
  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }

    await requireSession();
    const { slug, issueId: rawIssueId } = await context.params;
    const issueId = Number(rawIssueId);
    if (!Number.isInteger(issueId) || issueId < 0) {
      throw new ContributeError(400, "Invalid bounty ID");
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const prNumber = typeof body?.prNumber === "number" ? body.prNumber : Number(body?.prNumber);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new ContributeError(400, "Enter a valid pull request number");
    }

    const config = getPlatformConfig();
    const store = await getPlatformStore();
    const github = await getGithubIdentity(request.headers);
    const result = await new ContributionService(store, config).recordMerge({
      slug,
      issueId,
      prNumber,
      githubLogin: github.login,
    });

    const indexer = await new IndexerService(store, config).tick();
    return NextResponse.json({ ...result, indexer });
  } catch (error) {
    return handlePlatformError(error);
  }
}
