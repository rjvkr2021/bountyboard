import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import { nearToYocto } from "../../format";
import { platformAccountNames } from "../naming";
import { FilePlatformStore } from "../store";
import { LaunchService } from "./service";
import type { DeploymentAdapter, LaunchRequest, LaunchResult } from "./types";
import type { GithubVerifier } from "./verifier";

const github = {
  repoId: 123456,
  fullName: "near/example",
  defaultBranch: "main",
  isPrivate: false,
  viewerId: 987,
  viewerLogin: "maintainer",
  viewerPermission: "ADMIN" as const,
};

class TestVerifier implements GithubVerifier {
  async verify() {
    return github;
  }
}

class PrivateVerifier implements GithubVerifier {
  async verify() {
    return { ...github, isPrivate: true };
  }
}

class TestAdapter implements DeploymentAdapter {
  async launch(request: LaunchRequest): Promise<LaunchResult> {
    const accounts = platformAccountNames(request.slug, "bountyboard.testnet");
    const now = new Date().toISOString();
    return {
      accounts: { root: "bountyboard.testnet", ...accounts },
      wasmHash: "test-wasm",
      launchBlockHeight: 1,
      txHashes: ["tx-dao", "tx-board", "tx-oracle"],
      council: [request.founderAccount],
      board: {
        boardAccount: accounts.board,
        repoId: 0,
        githubRepo: request.repository.fullName,
        githubRepoId: request.repository.githubRepoId,
        verificationSource: "github_app",
        maintainers: {
          [request.founderAccount]: {
            since: now,
            bounties_approved: 0,
            closed_by_tier: { s0: 0, s1: 0, s2: 0, s3: 0 },
            last_council_request_at: "",
            council_derived: true,
            promoted: false,
          },
        },
        oracle: accounts.oracle,
        budget: nearToYocto(String(request.budgetNear)),
        committed: "0",
        dailyCap: nearToYocto(String(request.dailyCapNear)),
        paused: false,
        bootstrapEnded: false,
        bootstrapUntilMaintainers: 3,
        payoutBondRequired: false,
        updatedAt: now,
      },
      issues: [],
      events: [
        {
          boardAccount: accounts.board,
          type: "repo_added",
          payload: { github_repo_id: request.repository.githubRepoId },
          txHash: "tx-repo",
          blockHeight: 1,
          occurredAt: now,
        },
      ],
      identity: {
        githubUserId: request.github.viewerId,
        githubLogin: request.github.viewerLogin,
        nearAccount: request.founderAccount,
        source: "github_app",
        linkedAt: now,
        updatedAt: now,
      },
    };
  }
}

function setup(
  verifier: GithubVerifier = new TestVerifier(),
  options: { withIdentity?: boolean; accountExists?: boolean } = {},
) {
  const config = getPlatformConfig();
  const store = new FilePlatformStore(join(mkdtempSync(join(tmpdir(), "platform-launch-")), "data.json"));
  if (options.withIdentity !== false) {
    store.upsertIdentity({
      githubUserId: 987,
      githubLogin: "maintainer",
      nearAccount: "founder.testnet",
      source: "nep413",
      linkedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  const service = new LaunchService(store, {
    config,
    adapter: new TestAdapter(),
    verifier,
    accountExists: async () => options.accountExists !== false,
  });
  return { store, service };
}

describe("LaunchService", () => {
  it("launches a repository with live dependencies", async () => {
    const { store, service } = setup();
    const { repository, deployment } = await service.launch({
      githubRepo: "near/example",
      slug: "example",
      budgetNear: 50,
      dailyCapNear: 10,
      ownerUserId: "user-1",
    });

    expect(deployment.status).toBe("active");
    expect(deployment.wasmHash).toBe("test-wasm");
    expect(deployment.boardAccount).toBe("example-board.bountyboard.testnet");
    expect(store.getRepositoryBySlug("example")?.githubRepoId).toBe(repository.githubRepoId);
    expect(store.getRepositoryBySlug("example")?.verificationSource).toBe("github_app");
    expect(store.getRepositoryBySlug("example")?.ownerUserId).toBe("user-1");
    expect(store.getBoard(deployment.boardAccount)?.budget).toBe("50000000000000000000000000");
    expect(store.listEvents(deployment.boardAccount)).toHaveLength(1);
    expect(store.getIdentityByNearAccount("founder.testnet")?.githubLogin).toBe("maintainer");
  });

  it("upgrades a legacy listing into a launched board", async () => {
    const { store, service } = setup();
    const legacy = store.insertRepository({
      id: "legacy-listing",
      githubRepoId: 123456,
      owner: "near",
      name: "example",
      fullName: "near/example",
      slug: "test-repo-1",
      description: "legacy listing",
      defaultBranch: "main",
      isPrivate: false,
      verificationSource: "github_app",
      verified: true,
      launchedBy: "",
      ownerUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const { repository, deployment } = await service.launch({
      githubRepo: "near/example",
      ownerUserId: "user-1",
    });

    expect(deployment.status).toBe("active");
    expect(repository.id).toBe(legacy.id);
    expect(repository.slug).toBe("test-repo-1");
    expect(store.listRepositories()).toHaveLength(1);
    expect(store.getDeploymentByRepositoryId(legacy.id)?.status).toBe("active");
  });

  it("accepts fractional launch budgets", async () => {
    const { service } = setup();
    const { deployment } = await service.launch({
      githubRepo: "near/example",
      budgetNear: 3.5,
      dailyCapNear: 1.5,
    });
    expect(deployment.status).toBe("active");
  });

  it("rejects a reused launch funding transaction", async () => {
    const { service } = setup();
    await service.launch({ githubRepo: "near/example", fundingTxHash: "fund-1" });
    await expect(
      service.launch({ githubRepo: "near/other", fundingTxHash: "fund-1" }),
    ).rejects.toThrow(/already been used/);
  });

  it("rejects duplicate repositories", async () => {
    const { service } = setup();
    await service.launch({ githubRepo: "near/example", slug: "example" });
    await expect(
      service.launch({ githubRepo: "near/example", slug: "example2" }),
    ).rejects.toThrow(/already.*launched/);
  });

  it("requires a linked NEAR identity before launch", async () => {
    const { service } = setup(new TestVerifier(), { withIdentity: false });
    await expect(
      service.launch({ githubRepo: "near/example" }),
    ).rejects.toThrow(/Link a NEAR account/);
  });

  it("rejects a linked NEAR account that does not exist", async () => {
    const { service } = setup(new TestVerifier(), { accountExists: false });
    await expect(
      service.launch({ githubRepo: "near/example" }),
    ).rejects.toThrow(/does not exist/);
  });

  it("rejects private repositories", async () => {
    const { service } = setup(new PrivateVerifier());
    await expect(
      service.launch({ githubRepo: "near/example" }),
    ).rejects.toThrow(/Only public repositories/);
  });

  it("rejects invalid slug and budget", async () => {
    const { service } = setup();
    await expect(
      service.launch({ githubRepo: "near/example", slug: "X" }),
    ).rejects.toThrow(/3-32/);
    await expect(
      service.launch({ githubRepo: "near/example2", budgetNear: 0 }),
    ).rejects.toThrow(/greater than zero/);
  });
});
