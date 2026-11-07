import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Worker,
  type NearAccount,
  type TransactionResult,
} from "near-workspaces";

import {
  buildPolicy,
  type Policy,
  type PolicyParams,
} from "../../scripts/lib/policy";

export const ROOT_DIR = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);
export const ONE_NEAR = 10n ** 24n;
export const TGAS = 10n ** 12n;
export const DAO_GAS = 200n * TGAS;
export const BOARD_GAS = 100n * TGAS;
export const PAYOUT_GAS = 250n * TGAS;
export const MAX_DEADLINE = "2592000000000000";

export const SPUTNIK_WASM = resolve(ROOT_DIR, ".cache/sputnikdao2.wasm");
export const BOARD_WASM = resolve(
  ROOT_DIR,
  "contracts/bounty-board/target/near/bounty_board.wasm",
);

export interface IssueView {
  repo_id: number;
  kind: string;
  issue_number: number | null;
  private_ref: string | null;
  tier: string;
  amount: string;
  status: string;
  creator: string;
  claimants: string[];
  approvals: Array<{ approver: string; source: string; at: string }>;
  intended_contributor: string | null;
  merge_proof: {
    pr_number: number;
    pr_author_handle: string;
    pr_author_account: string | null;
    commit: string;
    source: string;
    at: string;
  } | null;
  security: {
    ghsa_id: string;
    advisory_url: string;
    researcher_github: string;
    disclosed_at: string;
  } | null;
  s0: {
    proposal_id: number | null;
    native_bounty_id: number | null;
    bounty_done_proposal_id: number | null;
  } | null;
  payout_id: number | null;
  payout_proposal_id: number | null;
  pending_payout: {
    issue_id: number;
    recipient: string;
    amount: string;
    proof_kind: string;
    proposal_id: number | null;
    proposal_kind: unknown;
  } | null;
  blocked_reason: string | null;
  cancelled_by: string | null;
  created_at: string;
}

export interface ReputationView {
  completed: number;
  total_earned: string;
  points: number;
  has_s1_or_s0: boolean;
  completed_by_tier: { s0: number; s1: number; s2: number; s3: number };
  payout_ids: number[];
}

export interface CandidateView {
  account: string;
  created_at: string;
  challenge_until: string;
  vetoed: boolean;
  points: number;
  completed: number;
  completed_by_tier: { s0: number; s1: number; s2: number; s3: number };
}

export interface PayoutView {
  issue_id: number;
  recipient: string;
  amount: string;
  tier: string;
  points: number;
  status: string;
  attempt: number;
  proof: unknown;
}

export interface BootstrapStateView {
  active: boolean;
  maintainers_len: number;
  threshold: number;
  ended: boolean;
}

export interface World {
  name: string;
  worker: Worker;
  dao: NearAccount;
  board: NearAccount;
  founder: NearAccount;
  contributor: NearAccount;
  oracle: NearAccount;
  maintainer2: NearAccount;
  maintainer3: NearAccount;
  council2: NearAccount;
  researcher: NearAccount;
  payer: NearAccount;
  policy: Policy;
}

export interface WorldOptions {
  name: string;
  maintainers: "single" | "three";
  boardConfig?: {
    bootstrap_until_maintainers?: number;
    maintainer_challenge_secs?: number;
    council_promotion_min_tenure_secs?: number;
    council_promotion_delay_secs?: number;
    council_promotion_min_approvals?: number;
    council_role_name?: string;
    payout_bond_required?: boolean;
  };
  repoMetadata?: {
    github_repo_id: number;
    verification_source: string;
  };
}

export function near(amount: number | string | bigint): bigint {
  if (typeof amount === "bigint") {
    return amount * ONE_NEAR;
  }
  if (typeof amount === "number") {
    return BigInt(amount) * ONE_NEAR;
  }
  if (amount.includes(".")) {
    const [whole = "0", fraction = ""] = amount.split(".");
    return BigInt(whole) * ONE_NEAR + BigInt(fraction.padEnd(24, "0").slice(0, 24));
  }
  return BigInt(amount) * ONE_NEAR;
}

export function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function waitFor<T>(
  label: string,
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 500;
  const started = Date.now();
  let last: T | undefined;
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await fn();
      if (predicate(last)) {
        return last;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${label}; last value=${JSON.stringify(last)}` +
      (lastError ? `; last error=${errorText(lastError)}` : ""),
  );
}

export function parseU64(result: TransactionResult): number {
  const value = result.parseResult<number | string>();
  return Number(value);
}

export async function createWorld(
  worker: Worker,
  options: WorldOptions,
): Promise<World> {
  const root = worker.rootAccount;
  const compute = (suffix: string) => `${suffix}-${options.name}`;

  const founder = await root.createSubAccount(compute("founder"), {
    initialBalance: near(20),
  });
  const contributor = await root.createSubAccount(compute("contributor"), {
    initialBalance: near(20),
  });
  const oracle = await root.createSubAccount(compute("oracle"), {
    initialBalance: near(20),
  });
  const maintainer2 = await root.createSubAccount(compute("maintainer2"), {
    initialBalance: near(20),
  });
  const maintainer3 = await root.createSubAccount(compute("maintainer3"), {
    initialBalance: near(20),
  });
  const council2 = await root.createSubAccount(compute("council2"), {
    initialBalance: near(20),
  });
  const researcher = await root.createSubAccount(compute("researcher"), {
    initialBalance: near(20),
  });
  const payer = await root.createSubAccount(compute("payer"), {
    initialBalance: near(20),
  });

  const dao = await root.createSubAccount(compute("dao"), {
    initialBalance: near(200),
  });
  const board = await root.createSubAccount(compute("board"), {
    initialBalance: near(100),
  });

  const policyParams: PolicyParams = {
    founder: founder.accountId,
    bountyboard: board.accountId,
    proposalBondNear: 1,
    bountyBondNear: 1,
    proposalPeriodSecs: 604_800,
    bountyForgivenessPeriodSecs: 86_400,
  };
  const policy = buildPolicy(policyParams);

  const [sputnikWasm, boardWasm] = await Promise.all([
    readFile(SPUTNIK_WASM),
    readFile(BOARD_WASM),
  ]);

  await dao.deploy(sputnikWasm);
  await dao.call(
    dao,
    "new",
    {
      config: {
        name: `BountyBoard ${options.name}`,
        purpose: "BountyBoard sandbox integration tests",
        metadata: "",
      },
      policy,
    },
    { gas: DAO_GAS },
  );

  await board.deploy(boardWasm);
  const boardConfig = {
    bootstrap_until_maintainers: 3,
    maintainer_challenge_secs: 1,
    council_promotion_min_tenure_secs: 1,
    council_promotion_delay_secs: 1,
    council_promotion_min_approvals: 3,
    council_role_name: "council",
    ...options.boardConfig,
  };
  await board.call(
    board,
    "new",
    { dao: dao.accountId, config: boardConfig },
    { gas: BOARD_GAS },
  );

  await board.call(board, "fund_reserve", {}, { attachedDeposit: near(50) });

  const maintainers =
    options.maintainers === "three"
      ? [founder.accountId, maintainer2.accountId, maintainer3.accountId]
      : [founder.accountId];
  await dao.call(
    board,
    "add_repo",
    {
      github_repo: `bountyboard-test/${options.name}`,
      maintainers,
      oracle: oracle.accountId,
      ...(options.repoMetadata ? { metadata: options.repoMetadata } : {}),
    },
    { gas: BOARD_GAS },
  );
  await dao.call(
    board,
    "set_budget",
    { repo_id: 0, amount: near(150).toString() },
    { gas: BOARD_GAS },
  );
  await board.call(board, "sync_dao_params", {}, { gas: BOARD_GAS });
  await waitFor(
    `${options.name} DAO params sync`,
    () => board.view<{ proposal_bond: string }>("get_dao_params"),
    (params) => params.proposal_bond === near(1).toString(),
  );

  await oracle.call(
    board,
    "link_identity",
    { github_handle: "researcher-gh", near_account: researcher.accountId },
    { gas: BOARD_GAS },
  );

  return {
    name: options.name,
    worker,
    dao,
    board,
    founder,
    contributor,
    oracle,
    maintainer2,
    maintainer3,
    council2,
    researcher,
    payer,
    policy,
  };
}

export function utf8ToBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function functionCallProposal(
  receiverId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit = 0n,
  gas = BOARD_GAS,
): Record<string, unknown> {
  return {
    description: `test ${methodName}`,
    kind: {
      FunctionCall: {
        receiver_id: receiverId,
        actions: [
          {
            method_name: methodName,
            args: utf8ToBase64(JSON.stringify(args)),
            deposit: deposit.toString(),
            gas: gas.toString(),
          },
        ],
      },
    },
  };
}

export async function addProposal(
  world: World,
  proposer: NearAccount,
  proposal: Record<string, unknown>,
  bond = ONE_NEAR,
): Promise<number> {
  const result = await proposer.callRaw(
    world.dao,
    "add_proposal",
    { proposal },
    { attachedDeposit: bond, gas: DAO_GAS },
  );
  return parseU64(result);
}

export async function voteProposal(
  world: World,
  voter: NearAccount,
  proposalId: number,
  action = "VoteApprove",
): Promise<TransactionResult> {
  return voter.callRaw(
    world.dao,
    "act_proposal",
    { id: proposalId, action, memo: null },
    { gas: DAO_GAS },
  );
}

export async function getIssue(
  world: World,
  issueId: number,
): Promise<IssueView> {
  const issue = await world.board.view<IssueView | null>("get_issue", {
    issue_id: issueId,
  });
  if (!issue) {
    throw new Error(`Issue ${issueId} not found`);
  }
  return issue;
}

export async function waitForIssueStatus(
  world: World,
  issueId: number,
  statuses: string[],
): Promise<IssueView> {
  return waitFor(
    `issue ${issueId} status ${statuses.join("/")}`,
    () => getIssue(world, issueId),
    (issue) => statuses.includes(issue.status),
  );
}

export async function createPublicBounty(
  world: World,
  creator: NearAccount,
  issueNumber: number,
  tier: string,
  amountNear: number,
  contributor: NearAccount | null = null,
): Promise<number> {
  const result = await creator.callRaw(
    world.board,
    "create_bounty",
    {
      issue_number: issueNumber,
      tier,
      amount: near(amountNear).toString(),
      contributor: contributor ? contributor.accountId : null,
    },
    { gas: BOARD_GAS },
  );
  return parseU64(result);
}

export async function createPrivateBounty(
  world: World,
  creator: NearAccount,
  privateRef: string,
  tier: string,
  amountNear: number,
): Promise<{ issueId: number; logs: string[] }> {
  const result = await creator.callRaw(
    world.board,
    "create_private_security_bounty",
    {
      private_ref: privateRef,
      tier,
      amount: near(amountNear).toString(),
    },
    { gas: BOARD_GAS },
  );
  return { issueId: parseU64(result), logs: result.logs };
}

export async function approve(
  world: World,
  approver: NearAccount,
  issueId: number,
): Promise<void> {
  await approver.call(
    world.board,
    "approve",
    { issue_id: issueId },
    { gas: BOARD_GAS },
  );
}

export async function claim(
  world: World,
  claimant: NearAccount,
  issueId: number,
): Promise<void> {
  await claimant.call(
    world.board,
    "claim",
    { issue_id: issueId },
    { gas: BOARD_GAS },
  );
}

export async function linkIdentity(
  world: World,
  handle: string,
  account: NearAccount,
): Promise<void> {
  await world.oracle.call(
    world.board,
    "link_identity",
    { github_handle: handle, near_account: account.accountId },
    { gas: BOARD_GAS },
  );
}

export async function markMerged(
  world: World,
  issueId: number,
  handle: string,
  prNumber = issueId + 100,
): Promise<void> {
  await world.oracle.call(
    world.board,
    "mark_merged",
    {
      issue_id: issueId,
      pr_number: prNumber,
      pr_author_handle: handle,
      commit: `commit-${prNumber}`,
    },
    { gas: BOARD_GAS },
  );
}

export async function requestPayout(
  world: World,
  issueId: number,
  signer: NearAccount,
  bond = ONE_NEAR,
): Promise<void> {
  await signer.call(
    world.board,
    "request_payout",
    { issue_id: issueId },
    { attachedDeposit: bond, gas: PAYOUT_GAS },
  );
}

export async function waitForPayout(
  world: World,
  issueId: number,
  status = "Paid",
): Promise<IssueView> {
  return waitForIssueStatus(world, issueId, [status]);
}

export async function payPublicS2(
  world: World,
  input: {
    issueNumber: number;
    recipient: NearAccount;
    handle: string;
    approver?: NearAccount;
    amountNear?: number;
    skipClaim?: boolean;
  },
): Promise<{ issueId: number; before: bigint; after: bigint }> {
  const before = await input.recipient.availableBalance();
  const issueId = await createPublicBounty(
    world,
    world.founder,
    input.issueNumber,
    "S2",
    input.amountNear ?? 1,
  );
  await approve(world, input.approver ?? world.maintainer2, issueId);
  await linkIdentity(world, input.handle, input.recipient);
  if (!input.skipClaim) {
    await claim(world, input.recipient, issueId);
  }
  await markMerged(world, issueId, input.handle);
  await requestPayout(world, issueId, world.payer);
  await waitForPayout(world, issueId);
  const after = await input.recipient.availableBalance();
  return { issueId, before, after };
}

export function makeS0Bounty(
  description: string,
  amountNear: number,
): Record<string, unknown> {
  return {
    description,
    token: "",
    amount: near(amountNear).toString(),
    times: 1,
    max_deadline: MAX_DEADLINE,
  };
}

export async function getLastBountyId(world: World): Promise<number> {
  const value = await world.dao.view<number | string>("get_last_bounty_id");
  return Number(value) - 1;
}

export async function getLastProposalId(world: World): Promise<number> {
  const value = await world.dao.view<number | string>("get_last_proposal_id");
  return Number(value) - 1;
}

export async function bootstrapApprove(
  world: World,
  issueId: number,
): Promise<IssueView> {
  const proposalId = await addProposal(
    world,
    world.founder,
    functionCallProposal(
      world.board.accountId,
      "bootstrap_approve",
      { issue_id: issueId },
    ),
    ONE_NEAR,
  );
  await voteProposal(world, world.founder, proposalId);
  return waitForIssueStatus(world, issueId, ["Approved"]);
}

export async function waitForCandidate(
  world: World,
  account: NearAccount,
): Promise<CandidateView> {
  return waitFor(
    `candidate ${account.accountId}`,
    async () => {
      const candidates = await world.board.view<CandidateView[]>(
        "get_candidates",
        { from: 0, limit: 100 },
      );
      return candidates.find((item) => item.account === account.accountId);
    },
    (candidate) => candidate !== undefined,
  ) as Promise<CandidateView>;
}

export async function advanceChallenge(world: World): Promise<void> {
  await world.worker.provider.fastForward(2);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_200));
}

export async function createPublicS0(
  world: World,
  issueNumber: number,
  amountNear: number,
): Promise<{ issueId: number; bountyId: number; proposalId: number }> {
  const issueId = await createPublicBounty(
    world,
    world.founder,
    issueNumber,
    "S0",
    amountNear,
  );
  const issue = await waitFor(
    `S0 ${issueId} proposal`,
    () => getIssue(world, issueId),
    (value) => value.s0?.proposal_id != null,
  );
  const proposalId = issue.s0?.proposal_id;
  if (proposalId == null) {
    throw new Error(`S0 issue ${issueId} has no proposal id`);
  }
  await voteProposal(world, world.founder, proposalId);
  const bountyId = await getLastBountyId(world);
  await world.dao.call(
    world.board,
    "register_s0_bounty",
    { issue_id: issueId, bounty_id: bountyId },
    { gas: BOARD_GAS },
  );
  await waitForIssueStatus(world, issueId, ["Approved"]);
  return { issueId, bountyId, proposalId };
}

export async function claimNativeS0(
  world: World,
  bountyId: number,
  claimant: NearAccount,
): Promise<void> {
  await claimant.call(
    world.dao,
    "bounty_claim",
    { id: bountyId, deadline: "86400000000000" },
    { attachedDeposit: ONE_NEAR, gas: DAO_GAS },
  );
}

export async function completeNativeS0(
  world: World,
  bountyId: number,
  claimant: NearAccount,
  description: string,
): Promise<number> {
  const params = await world.board.view<{ proposal_bond: string }>("get_dao_params");
  return addProposal(
    world,
    claimant,
    {
      description,
      kind: {
        BountyDone: {
          bounty_id: bountyId,
          receiver_id: claimant.accountId,
        },
      },
    },
    BigInt(params.proposal_bond),
  );
}

export async function councilApprove(
  world: World,
  issueId: number,
): Promise<void> {
  await world.dao.call(
    world.board,
    "council_approve",
    { issue_id: issueId },
    { gas: BOARD_GAS },
  );
}

export async function payBootstrapIssue(
  world: World,
  issueNumber: number,
  recipient: NearAccount,
  handle: string,
): Promise<number> {
  const issueId = await createPublicBounty(
    world,
    world.founder,
    issueNumber,
    "S1",
    1,
  );
  await linkIdentity(world, handle, recipient);
  await bootstrapApprove(world, issueId);
  await claim(world, recipient, issueId);
  await markMerged(world, issueId, handle);
  await requestPayout(world, issueId, world.payer);
  await waitForPayout(world, issueId);
  return issueId;
}
