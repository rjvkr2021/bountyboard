import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform/config";
import { readIdentityChallenge } from "@/lib/platform/identity/challenge";
import { IdentityError } from "@/lib/platform/identity/errors";
import { getGithubIdentity } from "@/lib/platform/identity/github";
import { IdentityService } from "@/lib/platform/identity/service";
import { verifyIdentitySignature } from "@/lib/platform/identity/verify";
import { handlePlatformError } from "@/lib/platform/http";
import { isTrustedRequest } from "@/lib/platform/request";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }

    const session = await requireSession();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "JSON body required" }, { status: 400 });

    const challengeToken = typeof body.challengeToken === "string" ? body.challengeToken : "";
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const publicKey = typeof body.publicKey === "string" ? body.publicKey : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!challengeToken || !accountId || !publicKey || !signature) {
      throw new IdentityError(400, "challengeToken, accountId, publicKey, and signature are required");
    }

    const config = getPlatformConfig();
    const challenge = readIdentityChallenge(challengeToken, session.user.id, config);
    if (accountId !== challenge.nearAccount) {
      throw new IdentityError(400, "The signed NEAR account does not match the identity challenge");
    }

    await verifyIdentitySignature({
      config,
      accountId,
      publicKey,
      signature,
      message: challenge.message,
      recipient: challenge.recipient,
      nonce: challenge.nonce,
    });

    const service = new IdentityService(await getPlatformStore(), config);
    if (challenge.action === "unlink") {
      const identity = await service.unlink({
        githubUserId: challenge.githubUserId,
        nearAccount: challenge.nearAccount,
      });
      return NextResponse.json({ unlinked: true, identity });
    }

    const identity = await service.link({
      githubUserId: challenge.githubUserId,
      githubLogin: challenge.githubLogin,
      nearAccount: challenge.nearAccount,
    });
    return NextResponse.json({ identity });
  } catch (error) {
    return handlePlatformError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }

    await requireSession();
    const config = getPlatformConfig();
    const github = await getGithubIdentity(request.headers);
    const store = await getPlatformStore();
    const existing = store.getIdentityByUserId(github.userId);
    if (!existing) {
      throw new IdentityError(404, "This GitHub account has no linked NEAR account");
    }

    const service = new IdentityService(store, config);
    const identity = await service.unlink({
      githubUserId: github.userId,
      nearAccount: existing.nearAccount,
    });
    return NextResponse.json({ unlinked: true, identity });
  } catch (error) {
    return handlePlatformError(error);
  }
}
