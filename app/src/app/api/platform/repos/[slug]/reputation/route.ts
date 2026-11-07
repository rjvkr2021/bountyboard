import { NextResponse } from "next/server";
import { JsonRpcProvider } from "near-api-js";
import { getPlatformConfig } from "@/lib/platform/config";
import { handlePlatformError } from "@/lib/platform/http";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+)(\.(([a-z\d]+[-_])*[a-z\d]+))*$/;

interface ContractTierCounts {
  s0?: number;
  s1?: number;
  s2?: number;
  s3?: number;
}

interface ContractReputation {
  completed: number;
  total_earned: string;
  points: number;
  has_s1_or_s0: boolean;
  completed_by_tier?: ContractTierCounts;
  payout_ids: number[];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const account = new URL(request.url).searchParams.get("account")?.trim() ?? "";
    if (!NEAR_ACCOUNT_RE.test(account) || account.length < 2 || account.length > 64) {
      return NextResponse.json({ error: "Enter a valid NEAR account ID" }, { status: 400 });
    }

    const store = await getPlatformStore();
    const repository = store.getRepositoryBySlug(slug);
    if (!repository || repository.isPrivate) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }
    const deployment = store.getDeploymentByRepositoryId(repository.id);
    if (!deployment || deployment.status !== "active" || !deployment.boardAccount) {
      return NextResponse.json({ error: "This repository has no active board" }, { status: 409 });
    }

    const config = getPlatformConfig();
    const provider = new JsonRpcProvider({ url: config.rpcUrl });
    let reputation: ContractReputation;
    try {
      reputation = (await provider.callFunction({
        contractId: deployment.boardAccount,
        method: "get_reputation",
        args: { account },
      })) as ContractReputation;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `NEAR RPC view failed: ${detail}` }, { status: 502 });
    }

    return NextResponse.json({
      account,
      reputation: {
        completed: reputation.completed,
        totalEarned: reputation.total_earned,
        points: reputation.points,
        hasS1OrS0: reputation.has_s1_or_s0,
        completedByTier: {
          s0: Number(reputation.completed_by_tier?.s0 ?? 0),
          s1: Number(reputation.completed_by_tier?.s1 ?? 0),
          s2: Number(reputation.completed_by_tier?.s2 ?? 0),
          s3: Number(reputation.completed_by_tier?.s3 ?? 0),
        },
        payoutIds: reputation.payout_ids,
      },
    });
  } catch (error) {
    return handlePlatformError(error);
  }
}
