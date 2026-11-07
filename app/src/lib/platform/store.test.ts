import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilePlatformStore } from "./store";
import type { BoardSnapshot, IssueSnapshot, PlatformDeployment, PlatformRepository } from "./types";

const now = "2026-01-01T00:00:00.000Z";
const boardAccount = "sample-board.bountyboard.testnet";

const repo: PlatformRepository = {
  id: "r1",
  githubRepoId: 123,
  owner: "near",
  name: "sample",
  fullName: "near/sample",
  slug: "sample",
  description: "Sample",
  defaultBranch: "main",
  isPrivate: false,
  verificationSource: "github_app",
  verified: true,
  launchedBy: "founder.testnet",
  createdAt: now,
  updatedAt: now,
};

const deployment: PlatformDeployment = {
  id: "d1",
  repositoryId: repo.id,
  slug: repo.slug,
  network: "testnet",
  status: "active",
  rootAccount: "bountyboard.testnet",
  daoAccount: "sample-dao.bountyboard.testnet",
  boardAccount,
  oracleAccount: "sample-oracle.bountyboard.testnet",
  founderAccount: "founder.testnet",
  wasmHash: "wasm",
  launchBlockHeight: 1,
  txHashes: ["tx"],
  council: ["founder.testnet"],
  error: null,
  createdAt: now,
  updatedAt: now,
};

const board: BoardSnapshot = {
  boardAccount,
  repoId: 0,
  githubRepo: repo.fullName,
  githubRepoId: repo.githubRepoId,
  verificationSource: "github_app",
  maintainers: {
    "founder.testnet": {
      since: now,
      bounties_approved: 1,
      closed_by_tier: { s0: 0, s1: 0, s2: 0, s3: 0 },
      last_council_request_at: now,
      council_derived: true,
      promoted: false,
    },
  },
  oracle: deployment.oracleAccount,
  budget: "100000000000000000000000000",
  committed: "5000000000000000000000000",
  dailyCap: "25000000000000000000000000",
  paused: false,
  bootstrapEnded: false,
  bootstrapUntilMaintainers: 3,
  payoutBondRequired: false,
  updatedAt: now,
};

function issue(issueId: number, status: string, claimants: string[]): IssueSnapshot {
  return {
    boardAccount,
    issueId,
    issueNumber: issueId + 1,
    kind: "PublicIssue",
    tier: "S1",
    amount: "5000000000000000000000000",
    status,
    creator: "founder.testnet",
    claimants,
    approvals: [],
    intendedContributor: null,
    mergeProof: null,
    security: null,
    payoutId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), "platform-store-"));
  return { store: new FilePlatformStore(join(dir, "data.json")), path: join(dir, "data.json") };
}

describe("PlatformStore", () => {
  it("starts empty and persists repositories", () => {
    const { store, path } = tempStore();
    expect(store.listRepositories()).toHaveLength(0);
    store.insertRepository(repo);
    expect(store.getRepositoryBySlug("sample")?.fullName).toBe("near/sample");
    expect(new FilePlatformStore(path).getRepositoryBySlug("sample")?.id).toBe(repo.id);
  });

  it("rejects duplicate slugs and GitHub ids", () => {
    const { store } = tempStore();
    store.insertRepository(repo);
    expect(() => store.insertRepository({ ...repo, id: "r2" })).toThrow(/reserved/);
    expect(() => store.insertRepository({ ...repo, id: "r3", slug: "other" })).toThrow(/already launched/);
  });

  it("removes empty and null transaction hashes when loading", () => {
    const { path } = tempStore();
    writeFileSync(
      path,
      JSON.stringify({
        deployments: {
          d1: { ...deployment, txHashes: ["tx", "null", "", null] },
        },
      }),
    );
    const store = new FilePlatformStore(path);
    expect(store.getDeploymentById("d1")?.txHashes).toEqual(["tx"]);
  });

  it("purges legacy user records when loading", () => {
    const { path } = tempStore();
    writeFileSync(path, JSON.stringify({ users: [{ email: "old@example.com", passwordHash: "legacy" }] }));
    const legacy = new FilePlatformStore(path);
    const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(saved.users).toBeUndefined();
    expect(legacy.listRepositories()).toHaveLength(0);
  });

  it("lists repositories by owner", () => {
    const { store } = tempStore();
    store.insertRepository({ ...repo, ownerUserId: "u1" });
    expect(store.listRepositoriesByOwner("u1")).toHaveLength(1);
    expect(store.listRepositoriesByOwner("someone-else")).toHaveLength(0);
  });

  it("summarizes paid bounties and contributors", () => {
    const { store } = tempStore();
    store.insertRepository(repo);
    store.insertDeployment(deployment);
    store.upsertBoard(board);
    store.upsertIssue(issue(0, "Approved", []));
    store.upsertIssue(issue(1, "Paid", ["carol.testnet"]));

    const summary = store.summary(repo);
    expect(summary.issueCount).toBe(2);
    expect(summary.paidCount).toBe(1);
    expect(summary.openCount).toBe(1);
    expect(summary.contributorCount).toBe(1);
  });
});
