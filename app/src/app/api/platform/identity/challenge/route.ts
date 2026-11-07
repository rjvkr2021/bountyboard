import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform/config";
import { IdentityError } from "@/lib/platform/identity/errors";
import { createIdentityChallenge, type IdentityAction } from "@/lib/platform/identity/challenge";
import { getGithubIdentity } from "@/lib/platform/identity/github";
import { handlePlatformError } from "@/lib/platform/http";
import { isTrustedRequest } from "@/lib/platform/request";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+)(\.(([a-z\d]+[-_])*[a-z\d]+))*$/;

export async function POST(request: Request) {
  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }

    const session = await requireSession();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "JSON body required" }, { status: 400 });

    const action: IdentityAction = body.action === "unlink" ? "unlink" : "link";
    const nearAccount = typeof body.nearAccount === "string" ? body.nearAccount.trim() : "";
    if (!NEAR_ACCOUNT_RE.test(nearAccount) || nearAccount.length < 2 || nearAccount.length > 64) {
      throw new IdentityError(400, "Enter a valid NEAR account ID");
    }

    const config = getPlatformConfig();
    const github = await getGithubIdentity(request.headers);
    const store = await getPlatformStore();
    const identity = store.getIdentityByUserId(github.userId);

    if (action === "unlink") {
      if (!identity) {
        throw new IdentityError(404, "This GitHub account has no linked NEAR account");
      }
      if (identity.nearAccount !== nearAccount) {
        throw new IdentityError(400, "Connect the NEAR account currently linked to unlink it");
      }
    } else {
      const nearOwner = store.getIdentityByNearAccount(nearAccount);
      if (nearOwner && nearOwner.githubUserId !== github.userId) {
        throw new IdentityError(409, "That NEAR account is already linked to another GitHub identity");
      }
    }

    const baseUrl = config.auth.baseUrl || new URL(request.url).origin;
    const recipient = new URL(baseUrl).host;
    const challenge = createIdentityChallenge({
      config,
      userId: session.user.id,
      action,
      githubUserId: github.userId,
      githubLogin: github.login,
      nearAccount,
      recipient,
    });

    return NextResponse.json(challenge);
  } catch (error) {
    return handlePlatformError(error);
  }
}
