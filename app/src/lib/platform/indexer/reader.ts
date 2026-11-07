import { JsonRpcProvider } from "near-api-js";
import type {
  BoardSnapshot,
  IssueSnapshot,
  MergeProofSnapshot,
  SecurityDisclosureSnapshot,
} from "../types";

interface ContractTierCounts {
  s0?: number;
  s1?: number;
  s2?: number;
  s3?: number;
}

interface ContractMaintainer {
  since: string;
  bounties_approved: number;
  closed_by_tier?: ContractTierCounts;
  last_council_request_at: string;
  council_derived?: boolean;
  promoted?: boolean;
}

interface ContractRepo {
  github_repo: string;
  github_repo_id: number;
  verification_source: string;
  maintainers: Record<string, ContractMaintainer>;
}

interface ContractBudget {
  budget: string;
  committed: string;
  daily_cap: string;
  paused: boolean;
}

interface ContractBoardConfig {
  maintainer_challenge_secs: number;
  council_promotion_min_tenure_secs: number;
  council_promotion_delay_secs: number;
  council_promotion_min_approvals: number;
  council_role_name: string;
  payout_bond_required?: boolean;
}

interface ContractBootstrapState {
  active: boolean;
  maintainers_len: number;
  threshold: number;
  ended: boolean;
}

interface ContractCandidate {
  account: string;
  created_at: number | string;
  challenge_until: number | string;
  vetoed: boolean;
  points: number;
  completed: number;
  completed_by_tier?: ContractTierCounts;
}

interface ContractCouncilRequestView {
  account: string;
  active_proposal_id: number | null;
  last_request_at: number | string;
  retry_at: number | string;
}

interface ContractIssue {
  issue_number: number | null;
  private_ref?: string | null;
  kind: string;
  tier: string;
  amount: string;
  status: string;
  creator: string;
  claimants: string[];
  approvals: Array<{ approver: string; source: string; at: string }>;
  intended_contributor: string | null;
  merge_proof: MergeProofSnapshot | null;
  security: SecurityDisclosureSnapshot | null;
  s0?: {
    proposal_id: number | null;
    native_bounty_id: number | null;
    bounty_done_proposal_id: number | null;
  } | null;
  blocked_reason?: string | null;
  payout_proposal_id?: number | null;
  payout_id: number | null;
  created_at: string;
}

function tierCounts(value?: ContractTierCounts) {
  return {
    s0: Number(value?.s0 ?? 0),
    s1: Number(value?.s1 ?? 0),
    s2: Number(value?.s2 ?? 0),
    s3: Number(value?.s3 ?? 0),
  };
}

export interface BoardReadResult {
  board: BoardSnapshot;
  issues: IssueSnapshot[];
  blockHeight: number;
  blockHash: string;
}

export interface BoardReader {
  read(boardAccount: string, previous: BoardSnapshot): Promise<BoardReadResult>;
}

export class NearBoardReader implements BoardReader {
  private readonly provider: JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new JsonRpcProvider({ url: rpcUrl });
  }

  private async view<T>(
    contractId: string,
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return (await this.provider.callFunction({
          contractId,
          method,
          args,
        })) as T;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private async finalBlock() {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.provider.viewBlock({ finality: "final" });
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async read(boardAccount: string, previous: BoardSnapshot): Promise<BoardReadResult> {
    const [repo, budget, config, bootstrap, candidates, councilRequests, block] = await Promise.all([
      this.view<ContractRepo | null>(boardAccount, "get_repo"),
      this.view<ContractBudget | null>(boardAccount, "get_budget"),
      this.view<ContractBoardConfig>(boardAccount, "get_config"),
      this.view<ContractBootstrapState>(boardAccount, "get_bootstrap_state"),
      this.view<ContractCandidate[]>(boardAccount, "get_candidates", { from: 0, limit: 100 }),
      this.view<ContractCouncilRequestView[]>(boardAccount, "get_council_requests", {
        from: 0,
        limit: 100,
      }),
      this.finalBlock(),
    ]);
    if (!repo || !budget) {
      throw new Error(`Board ${boardAccount} has no initialized repo`);
    }

    const issues: IssueSnapshot[] = [];
    for (let from = 0; from < 10_000; from += 50) {
      const page = await this.view<ContractIssue[]>(boardAccount, "get_issues", {
        from,
        limit: 50,
      });
      page.forEach((issue, index) => {
        issues.push({
          boardAccount,
          issueId: from + index,
          issueNumber: issue.issue_number,
          privateRef: issue.private_ref ?? null,
          kind: issue.kind as IssueSnapshot["kind"],
          tier: issue.tier,
          amount: issue.amount,
          status: issue.status,
          creator: issue.creator,
          claimants: issue.claimants,
          approvals: issue.approvals,
          intendedContributor: issue.intended_contributor,
          mergeProof: issue.merge_proof,
          security: issue.security,
          s0: issue.s0 ?? null,
          blockedReason: issue.blocked_reason ?? null,
          payoutId: issue.payout_id,
          payoutProposalId: issue.payout_proposal_id ?? null,
          createdAt: issue.created_at,
          updatedAt: new Date().toISOString(),
        });
      });
      if (page.length < 50) break;
    }

    const maintainers: BoardSnapshot["maintainers"] = {};
    for (const [account, record] of Object.entries(repo.maintainers)) {
      maintainers[account] = {
        since: String(record.since),
        bounties_approved: record.bounties_approved,
        closed_by_tier: tierCounts(record.closed_by_tier),
        last_council_request_at: String(record.last_council_request_at),
        council_derived: record.council_derived ?? false,
        promoted: record.promoted ?? false,
      };
    }

    return {
      board: {
        ...previous,
        githubRepo: repo.github_repo,
        githubRepoId: repo.github_repo_id,
        verificationSource: repo.verification_source as BoardSnapshot["verificationSource"],
        maintainers,
        budget: budget.budget,
        committed: budget.committed,
        dailyCap: budget.daily_cap,
        paused: budget.paused,
        bootstrapEnded: bootstrap.ended,
        bootstrapUntilMaintainers: bootstrap.threshold,
        payoutBondRequired: config.payout_bond_required ?? true,
        governanceConfig: {
          maintainerChallengeSecs: config.maintainer_challenge_secs,
          councilPromotionMinTenureSecs: config.council_promotion_min_tenure_secs,
          councilPromotionDelaySecs: config.council_promotion_delay_secs,
          councilPromotionMinApprovals: config.council_promotion_min_approvals,
          councilRoleName: config.council_role_name,
        },
        bootstrap: {
          active: bootstrap.active,
          maintainersLen: bootstrap.maintainers_len,
          threshold: bootstrap.threshold,
          ended: bootstrap.ended,
        },
        candidates: candidates.map((candidate) => ({
          account: candidate.account,
          createdAt: String(candidate.created_at),
          challengeUntil: String(candidate.challenge_until),
          vetoed: candidate.vetoed,
          points: candidate.points,
          completed: candidate.completed,
          completedByTier: tierCounts(candidate.completed_by_tier),
        })),
        councilRequests: councilRequests.map((request) => ({
          account: request.account,
          activeProposalId: request.active_proposal_id,
          lastRequestAt: String(request.last_request_at),
          retryAt: String(request.retry_at),
        })),
        updatedAt: new Date().toISOString(),
      },
      issues,
      blockHeight: block.header.height,
      blockHash: block.header.hash,
    };
  }
}
