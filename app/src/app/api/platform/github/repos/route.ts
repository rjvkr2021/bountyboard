import { NextResponse } from "next/server";
import { listGithubAdminRepositories } from "@/lib/platform/github-repositories";
import { getGithubAccessToken } from "@/lib/platform/identity/github";
import { handlePlatformError } from "@/lib/platform/http";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSession();
    const token = await getGithubAccessToken(request.headers);
    const repositories = await listGithubAdminRepositories(token);
    return NextResponse.json({ repositories });
  } catch (error) {
    return handlePlatformError(error);
  }
}
