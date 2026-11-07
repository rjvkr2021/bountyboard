import type { GithubRepoAdmin } from "../github-admin";
import type {
  BoardSnapshot,
  IdentityRecord,
  IssueSnapshot,
  PlatformEvent,
  PlatformRepository,
} from "../types";

export interface LaunchRequest {
  repository: PlatformRepository;
  slug: string;
  founderAccount: string;
  github: GithubRepoAdmin;
  budgetNear: number;
  dailyCapNear: number;
}

export interface LaunchAccountSet {
  root: string;
  dao: string;
  board: string;
  oracle: string;
}

export interface LaunchResult {
  accounts: LaunchAccountSet;
  wasmHash: string;
  launchBlockHeight: number | null;
  txHashes: string[];
  council: string[];
  board: BoardSnapshot;
  issues: IssueSnapshot[];
  events: Array<Omit<PlatformEvent, "id" | "ingestedAt">>;
  identity: IdentityRecord | null;
  oraclePublicKey?: string;
}

export interface DeploymentAdapter {
  launch(request: LaunchRequest): Promise<LaunchResult>;
}

export function boardConfigFromEnv(): {
  bootstrapUntilMaintainers: number;
  dailyCapNear: number;
} {
  return {
    bootstrapUntilMaintainers: 3,
    dailyCapNear: 25,
  };
}
