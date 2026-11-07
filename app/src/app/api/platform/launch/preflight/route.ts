import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform/config";
import { getGithubIdentity } from "@/lib/platform/identity/github";
import { handlePlatformError } from "@/lib/platform/http";
import { launchFundingRequirement } from "@/lib/platform/launch/funding";
import { nearAccountExists } from "@/lib/platform/near-account";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSession();
    const config = getPlatformConfig();
    const github = await getGithubIdentity(request.headers);
    const identity = (await getPlatformStore()).getIdentityByUserId(github.userId);
    const accountExists = identity
      ? await nearAccountExists(config, identity.nearAccount)
      : false;

    return NextResponse.json({
      github,
      identity,
      account: identity?.nearAccount ?? null,
      accountExists,
      network: config.network,
      funding: await launchFundingRequirement(config),
    });
  } catch (error) {
    return handlePlatformError(error);
  }
}
