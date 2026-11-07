import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import type { NearChain } from "../launch/near-chain";
import { FilePlatformStore } from "../store";
import type {
  IssueSnapshot,
  PlatformDeployment,
  PlatformRepository,
} from "../types";
import { ContributionService } from "./service";

const now = "2026-01-01T00:00:00.000Z";

class TestChain implements NearChain {
  calls: Array<{ signer: string; contractId: string; methodName: string; args: Record<string, unknown> }> = [];

  async createSubAccount(): Promise<string> {
    throw new Error("not implemented");
  }

  async deploy(): Promise<string> {
    throw new Error("not implemented");
  }

  async call(
    signerAccount: string,
    _secretKey: string,
    contractId: string,
    methodName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.calls.push({ signer: signerAccount, contractId, methodName, args });
    return { transaction: { hash: "tx-merge" } };
  }

  async callWithResult(): Promise<{ hash: string; result: unknown }> {
    throw new Error("not implemented");
  }

  async deleteKey(): Promise<string> {
    throw new Error("not implemented");
  }

  async view<T>(): Promise<T> {
    throw new Error("not implemented");
  }
}

const repository: PlatformRepository = {
  id: "repo-1",
  githubRepoId: 123,
  owner: "near",
  name: "example",
  fullName: "near/example",
  slug: "example",
  description: "Example",
  defaultBranch: "main",
  isPrivate: false,
  verificationSource: "github_app",
  verified: true,
  launchedBy: "founder.testnet",
  ownerUserId: "user-1",
  createdAt: now,
  updatedAt: now,
};

const deployment: PlatformDeployment = {
  id: "deployment-1",
  repositoryId: repository.id,
  slug: repository.slug,
  network: "testnet",
  status: "active",
  rootAccount: "bountyboard.testnet",
  daoAccount: "example-dao.bountyboard.testnet",
  boardAccount: "example-board.bountyboard.testnet",
  oracleAccount: "example-oracle.bountyboard.testnet",
  founderAccount: "founder.testnet",
  wasmHash: "wasm",
  launchBlockHeight: 1,
  txHashes: [],
  council: ["founder.testnet"],
  error: null,
  createdAt: now,
  updatedAt: now,
};

function issue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    boardAccount: deployment.boardAccount,
    issueId: 0,
    issueNumber: 7,
    kind: "PublicIssue",
    tier: "S1",
    amount: "10000000000000000000000000",
    status: "Approved",
    creator: "founder.testnet",
    claimants: ["alice.testnet"],
    approvals: [],
    intendedContributor: null,
    mergeProof: null,
    security: null,
    payoutId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(options: {
  issueOverrides?: Partial<IssueSnapshot>;
  withIdentity?: boolean;
  pull?: Record<string, unknown>;
} = {}) {
  const store = new FilePlatformStore(
    join(mkdtempSync(join(tmpdir(), "platform-contribute-")), "data.json"),
  );
  store.insertRepository(repository);
  store.insertDeployment(deployment);
  store.upsertIssue(issue(options.issueOverrides));
  if (options.withIdentity !== false) {
    store.upsertIdentity({
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
      source: "nep413",
      linkedAt: now,
      updatedAt: now,
    });
  }

  const config = getPlatformConfig();
  config.near.oraclePrivateKey = "ed25519:test";
  const chain = new TestChain();
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify(
        options.pull ?? {
          number: 9,
          title: "Fix the widget",
          body: "Closes #7",
          merged_at: "2026-01-02T00:00:00Z",
          merge_commit_sha: "abc123",
          html_url: "https://github.com/near/example/pull/9",
          user: { login: "alice" },
          base: { repo: { full_name: "near/example" } },
        },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  const service = new ContributionService(store, config, { chain, fetchImpl });
  return { store, chain, service };
}

describe("ContributionService", () => {
  it("verifies a merged PR and has the oracle record the merge proof", async () => {
    const { service, chain } = setup();

    const result = await service.recordMerge({
      slug: "example",
      issueId: 0,
      prNumber: 9,
      githubLogin: "alice",
    });

    expect(result.txHash).toBe("tx-merge");
    expect(result.pr).toMatchObject({ number: 9, author: "alice", commit: "abc123" });
    expect(chain.calls).toEqual([
      {
        signer: deployment.oracleAccount,
        contractId: deployment.boardAccount,
        methodName: "mark_merged",
        args: {
          issue_id: 0,
          pr_number: 9,
          pr_author_handle: "alice",
          commit: "abc123",
        },
      },
    ]);
  });

  it("requires a linked identity and a claim before merge proof", async () => {
    const noIdentity = setup({ withIdentity: false });
    await expect(
      noIdentity.service.recordMerge({
        slug: "example",
        issueId: 0,
        prNumber: 9,
        githubLogin: "alice",
      }),
    ).rejects.toThrow(/Link GitHub to a NEAR account/);

    const noClaim = setup({ issueOverrides: { claimants: [] } });
    await expect(
      noClaim.service.recordMerge({
        slug: "example",
        issueId: 0,
        prNumber: 9,
        githubLogin: "alice",
      }),
    ).rejects.toThrow(/Claim this bounty/);
  });

  it("rejects PRs from another author or without the issue reference", async () => {
    const wrongAuthor = setup({
      pull: {
        merged_at: "2026-01-02T00:00:00Z",
        merge_commit_sha: "abc123",
        title: "Fix #7",
        user: { login: "mallory" },
        base: { repo: { full_name: "near/example" } },
      },
    });
    await expect(
      wrongAuthor.service.recordMerge({
        slug: "example",
        issueId: 0,
        prNumber: 9,
        githubLogin: "alice",
      }),
    ).rejects.toThrow(/authored by your GitHub account/);

    const missingReference = setup({
      pull: {
        merged_at: "2026-01-02T00:00:00Z",
        merge_commit_sha: "abc123",
        title: "Fix the widget",
        body: "No issue reference",
        user: { login: "alice" },
        base: { repo: { full_name: "near/example" } },
      },
    });
    await expect(
      missingReference.service.recordMerge({
        slug: "example",
        issueId: 0,
        prNumber: 9,
        githubLogin: "alice",
      }),
    ).rejects.toThrow(/Reference issue #7/);
  });

  it("rejects merge proof before the bounty is approved", async () => {
    const { service } = setup({ issueOverrides: { status: "PendingApproval" } });
    await expect(
      service.recordMerge({
        slug: "example",
        issueId: 0,
        prNumber: 9,
        githubLogin: "alice",
      }),
    ).rejects.toThrow(/must be approved/);
  });
});
