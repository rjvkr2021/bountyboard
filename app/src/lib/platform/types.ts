export type PlatformDeploymentStatus =
  | "pending"
  | "verifying"
  | "deploying"
  | "active"
  | "failed"
  | "retired";

export interface PlatformRepository {
  id: string;
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  slug: string;
  description: string;
  defaultBranch: string;
  isPrivate: boolean;
  verificationSource: "github_app" | "legacy";
  verified: boolean;
  launchedBy: string;
  ownerUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformDeployment {
  id: string;
  repositoryId: string;
  slug: string;
  network: "testnet" | "mainnet" | "localnet";
  status: PlatformDeploymentStatus;
  rootAccount: string;
  daoAccount: string;
  boardAccount: string;
  oracleAccount: string;
  founderAccount: string;
  wasmHash: string;
  launchBlockHeight: number | null;
  txHashes: string[];
  council: string[];
  fundingTxHash?: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TierCounts {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface MaintainerSnapshot {
  since: string;
  bounties_approved: number;
  closed_by_tier: TierCounts;
  last_council_request_at: string;
  council_derived: boolean;
  promoted: boolean;
}

export interface GovernanceConfigSnapshot {
  maintainerChallengeSecs: number;
  councilPromotionMinTenureSecs: number;
  councilPromotionDelaySecs: number;
  councilPromotionMinApprovals: number;
  councilRoleName: string;
}

export interface BootstrapSnapshot {
  active: boolean;
  maintainersLen: number;
  threshold: number;
  ended: boolean;
}

export interface CandidateSnapshot {
  account: string;
  createdAt: string;
  challengeUntil: string;
  vetoed: boolean;
  points: number;
  completed: number;
  completedByTier: TierCounts;
}

export interface CouncilRequestSnapshot {
  account: string;
  activeProposalId: number | null;
  lastRequestAt: string;
  retryAt: string;
}

export interface BoardSnapshot {
  boardAccount: string;
  repoId: number;
  githubRepo: string;
  githubRepoId: number;
  verificationSource: string;
  maintainers: Record<string, MaintainerSnapshot>;
  oracle: string;
  budget: string;
  committed: string;
  dailyCap: string;
  paused: boolean;
  bootstrapEnded: boolean;
  bootstrapUntilMaintainers: number;
  payoutBondRequired: boolean;
  governanceConfig?: GovernanceConfigSnapshot | null;
  bootstrap?: BootstrapSnapshot | null;
  candidates?: CandidateSnapshot[];
  councilRequests?: CouncilRequestSnapshot[];
  updatedAt: string;
}

export interface ApprovalSnapshot {
  approver: string;
  source: string;
  at: string;
}

export interface MergeProofSnapshot {
  pr_number: number;
  pr_author_handle: string;
  pr_author_account: string | null;
  commit: string;
  source: string;
  at: string;
}

export interface SecurityDisclosureSnapshot {
  ghsa_id: string;
  advisory_url: string;
  researcher_github: string;
  disclosed_at: string;
}

export interface S0Snapshot {
  proposal_id: number | null;
  native_bounty_id: number | null;
  bounty_done_proposal_id: number | null;
}

export interface IssueSnapshot {
  boardAccount: string;
  issueId: number;
  issueNumber: number | null;
  privateRef?: string | null;
  kind: "PublicIssue" | "PrivateSecurity";
  tier: string;
  amount: string;
  status: string;
  creator: string;
  claimants: string[];
  approvals: ApprovalSnapshot[];
  intendedContributor: string | null;
  mergeProof: MergeProofSnapshot | null;
  security: SecurityDisclosureSnapshot | null;
  s0?: S0Snapshot | null;
  blockedReason?: string | null;
  payoutId: number | null;
  payoutProposalId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityRecord {
  githubUserId: number;
  githubLogin: string;
  nearAccount: string;
  source: "github_app" | "nep413";
  linkedAt: string;
  updatedAt: string;
}

export interface PlatformEvent {
  id: string;
  boardAccount: string;
  type: string;
  payload: Record<string, unknown>;
  txHash: string | null;
  blockHeight: number | null;
  occurredAt: string;
  ingestedAt: string;
}

export interface IndexerCursor {
  boardAccount: string;
  blockHeight: number | null;
  blockHash: string | null;
  updatedAt: string;
}

export interface PlatformData {
  version: 1;
  repositories: Record<string, PlatformRepository>;
  deployments: Record<string, PlatformDeployment>;
  boards: Record<string, BoardSnapshot>;
  issues: Record<string, IssueSnapshot>;
  identities: Record<string, IdentityRecord>;
  identityUnlinks: Record<string, string>;
  events: PlatformEvent[];
  cursors: Record<string, IndexerCursor>;
  meta: {
    createdAt: string;
    updatedAt: string;
  };
}

export interface RepositorySummary {
  repository: PlatformRepository;
  deployment: PlatformDeployment | null;
  board: BoardSnapshot | null;
  issueCount: number;
  paidCount: number;
  openCount: number;
  totalPaid: string;
  contributorCount: number;
}

export interface RepositoryDetail extends RepositorySummary {
  issues: IssueSnapshot[];
  events: PlatformEvent[];
  cursor: IndexerCursor | null;
}
