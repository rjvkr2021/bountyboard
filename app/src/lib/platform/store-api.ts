import type {
  BoardSnapshot,
  IdentityRecord,
  IndexerCursor,
  IssueSnapshot,
  PlatformData,
  PlatformDeployment,
  PlatformEvent,
  PlatformRepository,
  RepositoryDetail,
  RepositorySummary,
} from "./types";

export interface PlatformStore {
  listRepositoriesByOwner(ownerUserId: string): PlatformRepository[];
  listRepositories(): PlatformRepository[];
  getRepositoryById(id: string): PlatformRepository | null;
  getRepositoryBySlug(slug: string): PlatformRepository | null;
  getRepositoryByGithubId(githubRepoId: number): PlatformRepository | null;

  insertRepository(repository: PlatformRepository): PlatformRepository | Promise<PlatformRepository>;
  updateRepository(id: string, patch: Partial<PlatformRepository>): PlatformRepository | Promise<PlatformRepository>;

  listDeployments(): PlatformDeployment[];
  getDeploymentById(id: string): PlatformDeployment | null;
  getDeploymentByRepositoryId(repositoryId: string): PlatformDeployment | null;
  insertDeployment(deployment: PlatformDeployment): PlatformDeployment | Promise<PlatformDeployment>;
  updateDeployment(id: string, patch: Partial<PlatformDeployment>): PlatformDeployment | Promise<PlatformDeployment>;

  upsertBoard(board: BoardSnapshot): BoardSnapshot | Promise<BoardSnapshot>;
  getBoard(boardAccount: string): BoardSnapshot | null;
  listBoards(): BoardSnapshot[];
  upsertIssue(issue: IssueSnapshot): IssueSnapshot | Promise<IssueSnapshot>;
  getIssue(boardAccount: string, issueId: number): IssueSnapshot | null;
  listIssues(boardAccount: string): IssueSnapshot[];

  upsertIdentity(identity: IdentityRecord): IdentityRecord | Promise<IdentityRecord>;
  removeIdentity(githubUserId: number): IdentityRecord | null | Promise<IdentityRecord | null>;
  markIdentityUnlinked(githubUserId: number, at: string): void | Promise<void>;
  getIdentityUnlinkedAt(githubUserId: number): string | null;
  clearIdentityUnlink(githubUserId: number): void | Promise<void>;
  getIdentityByLogin(login: string): IdentityRecord | null;
  getIdentityByUserId(githubUserId: number): IdentityRecord | null;
  getIdentityByNearAccount(accountId: string): IdentityRecord | null;
  listIdentities(): IdentityRecord[];

  appendEvent(event: PlatformEvent): PlatformEvent | Promise<PlatformEvent>;
  listEvents(boardAccount?: string, limit?: number): PlatformEvent[];
  setCursor(cursor: IndexerCursor): IndexerCursor | Promise<IndexerCursor>;
  getCursor(boardAccount: string): IndexerCursor | null;
  getAllData(): PlatformData;
  summary(repository: PlatformRepository): RepositorySummary;
  detail(repository: PlatformRepository): RepositoryDetail;
}
