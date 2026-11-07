import { NextResponse } from "next/server";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const store = await getPlatformStore();
  const repositories = store
    .listRepositories()
    .filter((repository) => !repository.isPrivate && store.getDeploymentByRepositoryId(repository.id))
    .map((repository) => store.summary(repository));
  return NextResponse.json({ repositories });
}
