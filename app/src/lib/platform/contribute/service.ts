import type { PlatformConfig } from "../config";
import { JsonRpcNearChain, type NearChain } from "../launch/near-chain";
import type { PlatformStore } from "../store";
import { ContributeError } from "./errors";

interface GithubPullRequest {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  merged_at?: unknown;
  merge_commit_sha?: unknown;
  html_url?: unknown;
  user?: { login?: unknown } | null;
  base?: { repo?: { full_name?: unknown } | null } | null;
}

export interface RecordMergeInput {
  slug: string;
  issueId: number;
  prNumber: number;
  githubLogin: string;
}

export interface RecordMergeResult {
  txHash: string;
  pr: {
    number: number;
    author: string;
    commit: string;
    url: string;
  };
}

export interface ContributionServiceDependencies {
  chain?: NearChain;
  fetchImpl?: typeof fetch;
}

function transactionHash(value: unknown): string {
  if (typeof value === "string") return value;
  const outcome = value as { transaction?: { hash?: unknown } } | null;
  return typeof outcome?.transaction?.hash === "string" ? outcome.transaction.hash : "";
}

export class ContributionService {
  private readonly chain: NearChain;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly store: PlatformStore,
    private readonly config: PlatformConfig,
    dependencies: ContributionServiceDependencies = {},
  ) {
    this.chain =
      dependencies.chain ??
      new JsonRpcNearChain({
        rpcUrl: config.rpcUrl,
        deployerAccount: config.near.deployerAccount,
        deployerPrivateKey: config.near.deployerPrivateKey,
      });
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
  }

  async recordMerge(input: RecordMergeInput): Promise<RecordMergeResult> {
    const repository = this.store.getRepositoryBySlug(input.slug);
    if (!repository) throw new ContributeError(404, "Repository not found");
    const deployment = this.store.getDeploymentByRepositoryId(repository.id);
    if (!deployment || deployment.status !== "active" || !deployment.boardAccount) {
      throw new ContributeError(409, "This repository does not have an active bounty board");
    }
    const issue = this.store.getIssue(deployment.boardAccount, input.issueId);
    if (!issue) throw new ContributeError(404, "Bounty not found");
    if (issue.kind !== "PublicIssue") {
      throw new ContributeError(400, "Private security bounties use the advisory disclosure flow");
    }
    if (!issue.issueNumber) {
      throw new ContributeError(400, "This bounty is not linked to a GitHub issue number");
    }
    if (issue.status !== "Approved") {
      throw new ContributeError(409, "This bounty must be approved before merge proof can be recorded");
    }
    if (issue.mergeProof) {
      throw new ContributeError(409, "Merge proof is already recorded for this bounty");
    }
    if (repository.isPrivate) {
      throw new ContributeError(
        400,
        "Private repository merge verification requires the GitHub App integration",
      );
    }

    const identity = this.store.getIdentityByLogin(input.githubLogin);
    if (!identity) {
      throw new ContributeError(400, "Link GitHub to a NEAR account before submitting work");
    }
    if (!issue.claimants.includes(identity.nearAccount)) {
      throw new ContributeError(400, "Claim this bounty with your linked NEAR account before submitting work");
    }

    const pullUrl = `https://api.github.com/repos/${repository.fullName}/pulls/${input.prNumber}`;
    let response: Response | null = null;
    let lastFetchError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await this.fetchImpl(pullUrl, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "BountyBoard",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          cache: "no-store",
        });
        if (response.status < 500) break;
      } catch (fetchError) {
        lastFetchError = fetchError;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    if (!response) {
      const detail = lastFetchError instanceof Error ? lastFetchError.message : String(lastFetchError);
      throw new ContributeError(502, `GitHub request failed: ${detail}`);
    }

    if (response.status === 404) {
      throw new ContributeError(404, "Pull request not found or not public");
    }
    if (!response.ok) {
      throw new ContributeError(502, `GitHub returned HTTP ${response.status}`);
    }

    const pull = (await response.json().catch(() => null)) as GithubPullRequest | null;
    if (!pull) throw new ContributeError(502, "GitHub returned an invalid pull request");

    const author = typeof pull.user?.login === "string" ? pull.user.login : "";
    const baseRepo = typeof pull.base?.repo?.full_name === "string" ? pull.base.repo.full_name : "";
    const title = typeof pull.title === "string" ? pull.title : "";
    const body = typeof pull.body === "string" ? pull.body : "";
    const mergedAt = typeof pull.merged_at === "string" ? pull.merged_at : "";
    const commit = typeof pull.merge_commit_sha === "string" ? pull.merge_commit_sha : "";
    const url = typeof pull.html_url === "string" ? pull.html_url : "";

    if (!mergedAt) {
      throw new ContributeError(409, "The pull request is not merged yet");
    }
    if (author.toLowerCase() !== input.githubLogin.toLowerCase()) {
      throw new ContributeError(403, "The merged pull request must be authored by your GitHub account");
    }
    if (baseRepo.toLowerCase() !== repository.fullName.toLowerCase()) {
      throw new ContributeError(400, "The pull request belongs to a different repository");
    }
    if (!new RegExp(`(^|[^\\d])#${issue.issueNumber}(?!\\d)`).test(`${title}\n${body}`)) {
      throw new ContributeError(400, `Reference issue #${issue.issueNumber} in the pull request`);
    }
    if (!commit) {
      throw new ContributeError(502, "GitHub did not return a merge commit");
    }

    const oracleKey = this.config.near.oraclePrivateKey;
    if (!oracleKey) {
      throw new ContributeError(500, "PLATFORM_ORACLE_PRIVATE_KEY is required to record merge proof");
    }

    let txHash = "";
    try {
      const outcome = await this.chain.call(
        deployment.oracleAccount,
        oracleKey,
        deployment.boardAccount,
        "mark_merged",
        {
          issue_id: issue.issueId,
          pr_number: input.prNumber,
          pr_author_handle: identity.githubLogin,
          commit,
        },
      );
      txHash = transactionHash(outcome);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ContributeError(400, `Could not record merge proof: ${detail}`);
    }

    return {
      txHash,
      pr: {
        number: input.prNumber,
        author: identity.githubLogin,
        commit,
        url,
      },
    };
  }
}
