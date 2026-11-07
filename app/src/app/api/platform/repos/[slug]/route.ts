import { NextResponse } from "next/server";
import { handlePlatformError, platformError } from "@/lib/platform/http";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { isPrivateSecurityEvent } from "@/lib/platform/viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await getPlatformStore();
  const repository = store.getRepositoryBySlug(slug);
  if (!repository || repository.isPrivate) return platformError(404, "Repository not found");
  if (!store.getDeploymentByRepositoryId(repository.id)) {
    return platformError(404, "Repository has no launched board");
  }
  try {
    const detail = store.detail(repository);
    return NextResponse.json({
      ...detail,
      issues: detail.issues.filter((issue) => issue.kind !== "PrivateSecurity"),
      events: detail.events.filter((event) => !isPrivateSecurityEvent(event)),
    });
  } catch (error) {
    return handlePlatformError(error);
  }
}
