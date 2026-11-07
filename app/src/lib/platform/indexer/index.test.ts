import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import { FilePlatformStore } from "../store";
import type { BoardSnapshot, PlatformDeployment, PlatformRepository } from "../types";
import { IndexerService } from "./index";
import type { BoardReader } from "./reader";

const now = "2026-01-01T00:00:00.000Z";
const boardAccount = "sample-board.bountyboard.testnet";

function seed(store: FilePlatformStore): BoardSnapshot {
  const repository: PlatformRepository = {
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
    repositoryId: repository.id,
    slug: repository.slug,
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
    githubRepo: repository.fullName,
    githubRepoId: repository.githubRepoId,
    verificationSource: "github_app",
    maintainers: {},
    oracle: deployment.oracleAccount,
    budget: "100",
    committed: "0",
    dailyCap: "25",
    paused: false,
    bootstrapEnded: false,
    bootstrapUntilMaintainers: 3,
    payoutBondRequired: false,
    updatedAt: now,
  };
  store.insertRepository(repository);
  store.insertDeployment(deployment);
  store.upsertBoard(board);
  return board;
}

describe("IndexerService", () => {
  it("reconciles board and issue state through the reader", async () => {
    const store = new FilePlatformStore(join(mkdtempSync(join(tmpdir(), "platform-indexer-")), "data.json"));
    const board = seed(store);
    const reader: BoardReader = {
      async read(_boardAccount, previous) {
        return {
          board: { ...previous, budget: "200", updatedAt: new Date().toISOString() },
          issues: [
            {
              boardAccount,
              issueId: 0,
              issueNumber: 1,
              kind: "PublicIssue",
              tier: "S1",
              amount: "10",
              status: "PendingApproval",
              creator: "founder.testnet",
              claimants: [],
              approvals: [],
              intendedContributor: null,
              mergeProof: null,
              security: null,
              payoutId: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
          blockHeight: 2,
          blockHash: "hash",
        };
      },
    };
    const indexer = new IndexerService(store, getPlatformConfig(), reader);
    const result = await indexer.tick();

    expect(result.boards).toBe(1);
    expect(result.changedBoards).toBe(1);
    expect(result.changedIssues).toBe(1);
    expect(result.errors).toEqual([]);
    expect(store.getBoard(board.boardAccount)?.budget).toBe("200");
    expect(store.getCursor(board.boardAccount)?.blockHeight).toBe(2);
  });
});
