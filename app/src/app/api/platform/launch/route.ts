import { NextResponse } from "next/server";
import { isTrustedRequest } from "@/lib/platform/request";
import { requireSession } from "@/lib/session";
import { handlePlatformError } from "@/lib/platform/http";
import { getPlatformConfig } from "@/lib/platform/config";
import { getGithubAccessToken, getGithubIdentity } from "@/lib/platform/identity/github";
import { launchFundingRequirement } from "@/lib/platform/launch/funding";
import { verifyLaunchFunding } from "@/lib/platform/launch/funding-verification";
import { LaunchService } from "@/lib/platform/launch/service";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    const session = await requireSession();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    const githubRepo = typeof body.githubRepo === "string" ? body.githubRepo : "";
    if (!githubRepo) {
      return NextResponse.json({ error: "githubRepo is required" }, { status: 400 });
    }
    const fundingTxHash = typeof body.fundingTxHash === "string" ? body.fundingTxHash : "";
    if (!fundingTxHash) {
      return NextResponse.json({ error: "fundingTxHash is required" }, { status: 400 });
    }

    const config = getPlatformConfig();
    const store = await getPlatformStore();
    const github = await getGithubIdentity(request.headers);
    const identity = store.getIdentityByUserId(github.userId);
    if (!identity) {
      return NextResponse.json(
        { error: "Link a NEAR account to your GitHub identity before launching a board" },
        { status: 400 },
      );
    }

    const budgetNear =
      typeof body.budgetNear === "number" ? body.budgetNear : config.defaultBudgetNear;
    await verifyLaunchFunding({
      config,
      txHash: fundingTxHash,
      founder: identity.nearAccount,
      requiredYocto: (await launchFundingRequirement(config, budgetNear)).yocto,
    });

    const githubToken = await getGithubAccessToken(request.headers);
    const service = new LaunchService(store);
    const result = await service.launch({
      githubRepo,
      slug: typeof body.slug === "string" && body.slug ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      budgetNear,
      dailyCapNear: typeof body.dailyCapNear === "number" ? body.dailyCapNear : undefined,
      githubToken,
      ownerUserId: session.user.id,
      fundingTxHash,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handlePlatformError(error);
  }
}
