import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform/config";
import { handlePlatformError } from "@/lib/platform/http";
import { IndexerService } from "@/lib/platform/indexer";
import { isTrustedRequest } from "@/lib/platform/request";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runTick() {
  const indexer = new IndexerService(await getPlatformStore(), getPlatformConfig());
  return indexer.tick();
}

export async function GET(request: Request) {
  try {
    if (!cronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
    }
    return NextResponse.json(await runTick());
  } catch (error) {
    return handlePlatformError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    return NextResponse.json(await runTick());
  } catch (error) {
    return handlePlatformError(error);
  }
}
