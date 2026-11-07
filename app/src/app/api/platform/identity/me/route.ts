import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGithubIdentity } from "@/lib/platform/identity/github";
import { handlePlatformError } from "@/lib/platform/http";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSession();
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    if (!accounts.some((account) => account.providerId === "github")) {
      return NextResponse.json({ github: null, identity: null });
    }
    const github = await getGithubIdentity(request.headers);
    const identity = (await getPlatformStore()).getIdentityByUserId(github.userId);
    return NextResponse.json({ github, identity });
  } catch (error) {
    return handlePlatformError(error);
  }
}
