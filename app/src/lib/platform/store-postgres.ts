import type { Pool } from "pg";
import { emptyData, normalizePlatformData } from "./store";
import type { PlatformStore } from "./store-api";
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

const STATE_ID = "default";

export async function ensurePlatformSchema(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists platform_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(
    `insert into platform_state (id, data) values ($1, $2)
     on conflict (id) do nothing`,
    [STATE_ID, JSON.stringify(emptyData())],
  );
}

export class PostgresPlatformStore implements PlatformStore {
  private data: PlatformData;

  private constructor(
    private readonly pool: Pool,
    data: PlatformData,
  ) {
    this.data = data;
  }

  static async create(pool: Pool): Promise<PostgresPlatformStore> {
    await ensurePlatformSchema(pool);
    const result = await pool.query<{ data: PlatformData }>(
      "select data from platform_state where id = $1",
      [STATE_ID],
    );
    return new PostgresPlatformStore(pool, normalizePlatformData(result.rows[0].data));
  }

  private async mutate<T>(fn: (data: PlatformData) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ data: PlatformData }>(
        "select data from platform_state where id = $1 for update",
        [STATE_ID],
      );
      const data = normalizePlatformData(result.rows[0].data);
      const value = fn(data);
      data.meta.updatedAt = new Date().toISOString();
      await client.query(
        "update platform_state set data = $1, updated_at = now() where id = $2",
        [JSON.stringify(data), STATE_ID],
      );
      await client.query("commit");
      this.data = data;
      return value;
    } catch (error) {
      await client.query("rollback").catch(() => null);
      throw error;
    } finally {
      client.release();
    }
  }

  listRepositoriesByOwner(ownerUserId: string): PlatformRepository[] {
    return this.listRepositories().filter((repository) => repository.ownerUserId === ownerUserId);
  }
  listRepositories(): PlatformRepository[] {
    return Object.values(this.data.repositories).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  getRepositoryById(id: string): PlatformRepository | null {
    return this.data.repositories[id] ?? null;
  }
  getRepositoryBySlug(slug: string): PlatformRepository | null {
    return Object.values(this.data.repositories).find((repository) => repository.slug === slug) ?? null;
  }
  getRepositoryByGithubId(githubRepoId: number): PlatformRepository | null {
    return Object.values(this.data.repositories).find((repository) => repository.githubRepoId === githubRepoId) ?? null;
  }
  async insertRepository(repository: PlatformRepository): Promise<PlatformRepository> {
    return this.mutate((data) => {
      if (Object.values(data.repositories).some((repo) => repo.slug === repository.slug)) {
        throw new Error(`Slug ${repository.slug} is already reserved`);
      }
      if (Object.values(data.repositories).some((repo) => repo.githubRepoId === repository.githubRepoId)) {
        throw new Error(`GitHub repository ${repository.githubRepoId} is already launched`);
      }
      data.repositories[repository.id] = repository;
      return repository;
    });
  }
  async updateRepository(id: string, patch: Partial<PlatformRepository>): Promise<PlatformRepository> {
    return this.mutate((data) => {
      const current = data.repositories[id];
      if (!current) throw new Error(`Repository ${id} not found`);
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      data.repositories[id] = next;
      return next;
    });
  }

  listDeployments(): PlatformDeployment[] {
    return Object.values(this.data.deployments).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  getDeploymentById(id: string): PlatformDeployment | null {
    return this.data.deployments[id] ?? null;
  }
  getDeploymentByRepositoryId(repositoryId: string): PlatformDeployment | null {
    return (
      Object.values(this.data.deployments)
        .filter((deployment) => deployment.repositoryId === repositoryId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }
  async insertDeployment(deployment: PlatformDeployment): Promise<PlatformDeployment> {
    return this.mutate((data) => {
      data.deployments[deployment.id] = deployment;
      return deployment;
    });
  }
  async updateDeployment(id: string, patch: Partial<PlatformDeployment>): Promise<PlatformDeployment> {
    return this.mutate((data) => {
      const current = data.deployments[id];
      if (!current) throw new Error(`Deployment ${id} not found`);
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      data.deployments[id] = next;
      return next;
    });
  }

  async upsertBoard(board: BoardSnapshot): Promise<BoardSnapshot> {
    return this.mutate((data) => {
      data.boards[board.boardAccount] = board;
      return board;
    });
  }
  getBoard(boardAccount: string): BoardSnapshot | null {
    return this.data.boards[boardAccount] ?? null;
  }
  listBoards(): BoardSnapshot[] {
    return Object.values(this.data.boards);
  }
  async upsertIssue(issue: IssueSnapshot): Promise<IssueSnapshot> {
    return this.mutate((data) => {
      data.issues[`${issue.boardAccount}:${issue.issueId}`] = issue;
      return issue;
    });
  }
  getIssue(boardAccount: string, issueId: number): IssueSnapshot | null {
    return this.data.issues[`${boardAccount}:${issueId}`] ?? null;
  }
  listIssues(boardAccount: string): IssueSnapshot[] {
    return Object.values(this.data.issues)
      .filter((issue) => issue.boardAccount === boardAccount)
      .sort((a, b) => a.issueId - b.issueId);
  }

  async upsertIdentity(identity: IdentityRecord): Promise<IdentityRecord> {
    return this.mutate((data) => {
      for (const [key, existing] of Object.entries(data.identities)) {
        if (existing.githubUserId === identity.githubUserId) delete data.identities[key];
      }
      data.identities[`github:${identity.githubUserId}`] = identity;
      return identity;
    });
  }
  async removeIdentity(githubUserId: number): Promise<IdentityRecord | null> {
    return this.mutate((data) => {
      const entry = Object.entries(data.identities).find(
        ([, identity]) => identity.githubUserId === githubUserId,
      );
      if (!entry) return null;
      delete data.identities[entry[0]];
      return entry[1];
    });
  }
  async markIdentityUnlinked(githubUserId: number, at: string): Promise<void> {
    await this.mutate((data) => {
      data.identityUnlinks[String(githubUserId)] = at;
    });
  }
  getIdentityUnlinkedAt(githubUserId: number): string | null {
    return this.data.identityUnlinks[String(githubUserId)] ?? null;
  }
  async clearIdentityUnlink(githubUserId: number): Promise<void> {
    await this.mutate((data) => {
      delete data.identityUnlinks[String(githubUserId)];
    });
  }
  getIdentityByLogin(login: string): IdentityRecord | null {
    const normalized = login.toLowerCase();
    return Object.values(this.data.identities).find(
      (identity) => identity.githubLogin.toLowerCase() === normalized,
    ) ?? null;
  }
  getIdentityByUserId(githubUserId: number): IdentityRecord | null {
    return Object.values(this.data.identities).find(
      (identity) => identity.githubUserId === githubUserId,
    ) ?? null;
  }
  getIdentityByNearAccount(accountId: string): IdentityRecord | null {
    return Object.values(this.data.identities).find(
      (identity) => identity.nearAccount === accountId,
    ) ?? null;
  }
  listIdentities(): IdentityRecord[] {
    return Object.values(this.data.identities).sort((a, b) => b.linkedAt.localeCompare(a.linkedAt));
  }

  async appendEvent(event: PlatformEvent): Promise<PlatformEvent> {
    return this.mutate((data) => {
      data.events.push(event);
      if (data.events.length > 5_000) data.events = data.events.slice(-5_000);
      return event;
    });
  }
  listEvents(boardAccount?: string, limit = 50): PlatformEvent[] {
    return this.data.events
      .filter((event) => !boardAccount || event.boardAccount === boardAccount)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }
  async setCursor(cursor: IndexerCursor): Promise<IndexerCursor> {
    return this.mutate((data) => {
      data.cursors[cursor.boardAccount] = cursor;
      return cursor;
    });
  }
  getCursor(boardAccount: string): IndexerCursor | null {
    return this.data.cursors[boardAccount] ?? null;
  }
  getAllData(): PlatformData {
    return this.data;
  }

  summary(repository: PlatformRepository): RepositorySummary {
    const deployment = this.getDeploymentByRepositoryId(repository.id);
    const board = deployment ? this.getBoard(deployment.boardAccount) : null;
    const issues = board
      ? this.listIssues(board.boardAccount).filter((issue) => issue.kind !== "PrivateSecurity")
      : [];
    const paid = issues.filter((issue) => issue.status === "Paid");
    const totalPaid = paid.reduce((sum, issue) => sum + BigInt(issue.amount), 0n);
    return {
      repository,
      deployment,
      board,
      issueCount: issues.length,
      paidCount: paid.length,
      openCount: issues.filter((issue) => !["Paid", "Cancelled", "Refunded"].includes(issue.status)).length,
      totalPaid: totalPaid.toString(),
      contributorCount: new Set(
        issues.flatMap((issue) =>
          issue.claimants.length
            ? issue.claimants
            : issue.intendedContributor
              ? [issue.intendedContributor]
              : [],
        ),
      ).size,
    };
  }

  detail(repository: PlatformRepository): RepositoryDetail {
    const summary = this.summary(repository);
    const boardAccount = summary.board?.boardAccount ?? "";
    return {
      ...summary,
      issues: boardAccount ? this.listIssues(boardAccount) : [],
      events: boardAccount ? this.listEvents(boardAccount, 50) : [],
      cursor: boardAccount ? this.getCursor(boardAccount) : null,
    };
  }
}
