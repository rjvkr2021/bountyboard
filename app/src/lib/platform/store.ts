import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PlatformStore as PlatformStoreApi } from "./store-api";
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

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyData(): PlatformData {
  const now = nowIso();
  return {
    version: 1,
    repositories: {},
    deployments: {},
    boards: {},
    issues: {},
    identities: {},
    events: [],
    cursors: {},
    meta: { createdAt: now, updatedAt: now },
  };
}

export function normalizePlatformData(
  parsed: PlatformData & { users?: unknown; identityUnlinks?: unknown },
): PlatformData {
  const data: PlatformData & { users?: unknown; identityUnlinks?: unknown } = { ...parsed };
  delete data.users;
  delete data.identityUnlinks;
  const normalized = {
    ...emptyData(),
    ...data,
    meta: { ...emptyData().meta, ...parsed.meta },
  };
  for (const deployment of Object.values(normalized.deployments)) {
    deployment.txHashes = (deployment.txHashes ?? []).filter(
      (hash) => hash && hash !== "null",
    );
  }
  return normalized;
}

export class FilePlatformStore implements PlatformStoreApi {
  private data: PlatformData;

  constructor(private readonly filePath: string) {
    const { data, legacyUsers } = this.load();
    this.data = data;
    if (legacyUsers) this.save();
  }

  private load(): { data: PlatformData; legacyUsers: boolean } {
    if (!existsSync(this.filePath)) {
      return { data: emptyData(), legacyUsers: false };
    }
    const raw = readFileSync(this.filePath, "utf8");
    try {
      const parsed = JSON.parse(raw) as PlatformData & { users?: unknown };
      return {
        data: normalizePlatformData(parsed),
        legacyUsers: "users" in parsed,
      };
    } catch {
      throw new Error(`Platform data file is not valid JSON: ${this.filePath}`);
    }
  }

  private save(): void {
    this.data.meta.updatedAt = nowIso();
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(temp, this.filePath);
  }

  private mutate<T>(fn: (data: PlatformData) => T): T {
    const result = fn(this.data);
    this.save();
    return result;
  }

  listRepositoriesByOwner(ownerUserId: string): PlatformRepository[] {
    return this.listRepositories().filter(
      (repository) => repository.ownerUserId === ownerUserId,
    );
  }

  listRepositories(): PlatformRepository[] {
    return Object.values(this.data.repositories).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  getRepositoryById(id: string): PlatformRepository | null {
    return this.data.repositories[id] ?? null;
  }

  getRepositoryBySlug(slug: string): PlatformRepository | null {
    return (
      Object.values(this.data.repositories).find((repo) => repo.slug === slug) ?? null
    );
  }

  getRepositoryByGithubId(githubRepoId: number): PlatformRepository | null {
    return (
      Object.values(this.data.repositories).find(
        (repo) => repo.githubRepoId === githubRepoId,
      ) ?? null
    );
  }

  insertRepository(repository: PlatformRepository): PlatformRepository {
    return this.mutate((data) => {
      if (Object.values(data.repositories).some((repo) => repo.slug === repository.slug)) {
        throw new Error(`Slug ${repository.slug} is already reserved`);
      }
      if (
        Object.values(data.repositories).some(
          (repo) => repo.githubRepoId === repository.githubRepoId,
        )
      ) {
        throw new Error(`GitHub repository ${repository.githubRepoId} is already launched`);
      }
      data.repositories[repository.id] = repository;
      return repository;
    });
  }

  updateRepository(id: string, patch: Partial<PlatformRepository>): PlatformRepository {
    return this.mutate((data) => {
      const current = data.repositories[id];
      if (!current) throw new Error(`Repository ${id} not found`);
      const next = { ...current, ...patch, updatedAt: nowIso() };
      data.repositories[id] = next;
      return next;
    });
  }

  listDeployments(): PlatformDeployment[] {
    return Object.values(this.data.deployments).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
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

  insertDeployment(deployment: PlatformDeployment): PlatformDeployment {
    return this.mutate((data) => {
      data.deployments[deployment.id] = deployment;
      return deployment;
    });
  }

  updateDeployment(
    id: string,
    patch: Partial<PlatformDeployment>,
  ): PlatformDeployment {
    return this.mutate((data) => {
      const current = data.deployments[id];
      if (!current) throw new Error(`Deployment ${id} not found`);
      const next = { ...current, ...patch, updatedAt: nowIso() };
      data.deployments[id] = next;
      return next;
    });
  }

  upsertBoard(board: BoardSnapshot): BoardSnapshot {
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

  upsertIssue(issue: IssueSnapshot): IssueSnapshot {
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

  upsertIdentity(identity: IdentityRecord): IdentityRecord {
    return this.mutate((data) => {
      for (const [key, existing] of Object.entries(data.identities)) {
        if (existing.githubUserId === identity.githubUserId) delete data.identities[key];
      }
      data.identities[`github:${identity.githubUserId}`] = identity;
      return identity;
    });
  }

  removeIdentity(githubUserId: number): IdentityRecord | null {
    return this.mutate((data) => {
      const entry = Object.entries(data.identities).find(
        ([, identity]) => identity.githubUserId === githubUserId,
      );
      if (!entry) return null;
      delete data.identities[entry[0]];
      return entry[1];
    });
  }

  getIdentityByLogin(login: string): IdentityRecord | null {
    const normalized = login.toLowerCase();
    return (
      Object.values(this.data.identities).find(
        (identity) => identity.githubLogin.toLowerCase() === normalized,
      ) ?? null
    );
  }

  getIdentityByUserId(githubUserId: number): IdentityRecord | null {
    return (
      Object.values(this.data.identities).find(
        (identity) => identity.githubUserId === githubUserId,
      ) ?? null
    );
  }

  getIdentityByNearAccount(accountId: string): IdentityRecord | null {
    return (
      Object.values(this.data.identities).find(
        (identity) => identity.nearAccount === accountId,
      ) ?? null
    );
  }

  listIdentities(): IdentityRecord[] {
    return Object.values(this.data.identities).sort((a, b) =>
      b.linkedAt.localeCompare(a.linkedAt),
    );
  }

  appendEvent(event: PlatformEvent): PlatformEvent {
    return this.mutate((data) => {
      data.events.push(event);
      if (data.events.length > 5_000) {
        data.events = data.events.slice(-5_000);
      }
      return event;
    });
  }

  listEvents(boardAccount?: string, limit = 50): PlatformEvent[] {
    return this.data.events
      .filter((event) => !boardAccount || event.boardAccount === boardAccount)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }

  setCursor(cursor: IndexerCursor): IndexerCursor {
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
      openCount: issues.filter(
        (issue) => !["Paid", "Cancelled", "Refunded"].includes(issue.status),
      ).length,
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

export type { PlatformStore } from "./store-api";
