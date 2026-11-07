import { NextResponse } from "next/server";
import { handlePlatformError, platformError } from "@/lib/platform/http";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const store = await getPlatformStore();
    const deployment = store.getDeploymentById(id);
    if (!deployment) return platformError(404, "Launch not found");
    const repository = store.getRepositoryById(deployment.repositoryId);
    return NextResponse.json({ deployment, repository });
  } catch (error) {
    return handlePlatformError(error);
  }
}
