import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import type { NearChain } from "../launch/near-chain";
import { FilePlatformStore } from "../store";
import type { PlatformDeployment } from "../types";
import { IdentityService } from "./service";

const now = "2026-01-01T00:00:00.000Z";

class TestChain implements NearChain {
  calls: Array<{
    signer: string;
    contractId: string;
    methodName: string;
    args: Record<string, unknown>;
  }> = [];
  viewResult: unknown = null;

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
    return null;
  }

  async callWithResult(): Promise<{ hash: string; result: unknown }> {
    throw new Error("not implemented");
  }

  async deleteKey(): Promise<string> {
    throw new Error("not implemented");
  }

  async view<T>(): Promise<T> {
    return this.viewResult as T;
  }
}

const deployment: PlatformDeployment = {
  id: "deployment-1",
  repositoryId: "repo-1",
  slug: "example",
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

function setup(options: { cooldown?: number; seedDeployment?: boolean } = {}) {
  const store = new FilePlatformStore(
    join(mkdtempSync(join(tmpdir(), "platform-identity-")), "data.json"),
  );
  if (options.seedDeployment !== false) store.insertDeployment(deployment);
  let current = new Date("2026-01-01T00:00:00.000Z");
  const config = getPlatformConfig();
  config.identity.relinkCooldownSecs = options.cooldown ?? 0;
  config.near.oraclePrivateKey = "ed25519:test";
  const chain = new TestChain();
  const service = new IdentityService(store, config, {
    chain,
    now: () => current,
  });
  return {
    store,
    chain,
    service,
    advance(seconds: number) {
      current = new Date(current.getTime() + seconds * 1_000);
    },
  };
}

describe("IdentityService", () => {
  it("links a GitHub identity to a NEAR account on every active board", async () => {
    const { service, store, chain } = setup();

    const identity = await service.link({
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
    });

    expect(identity.source).toBe("nep413");
    expect(store.getIdentityByUserId(42)?.nearAccount).toBe("alice.testnet");
    expect(chain.calls).toEqual([
      {
        signer: deployment.oracleAccount,
        contractId: deployment.boardAccount,
        methodName: "link_identity_with_id",
        args: {
          github_handle: "alice",
          github_user_id: 42,
          near_account: "alice.testnet",
        },
      },
    ]);
  });

  it("rejects a NEAR account already linked to another GitHub identity", async () => {
    const { service, store } = setup({ seedDeployment: false });
    store.upsertIdentity({
      githubUserId: 1,
      githubLogin: "bob",
      nearAccount: "shared.testnet",
      source: "nep413",
      linkedAt: now,
      updatedAt: now,
    });

    await expect(
      service.link({ githubUserId: 42, githubLogin: "alice", nearAccount: "shared.testnet" }),
    ).rejects.toThrow(/already linked/);
  });

  it("unlinks the identity from every active board and records a cooldown", async () => {
    const { service, store, chain } = setup();
    await service.link({
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
    });
    chain.calls = [];
    chain.viewResult = "alice.testnet";

    const removed = await service.unlink({
      githubUserId: 42,
      nearAccount: "alice.testnet",
    });

    expect(removed.nearAccount).toBe("alice.testnet");
    expect(store.getIdentityByUserId(42)).toBeNull();
    expect(store.getIdentityUnlinkedAt(42)).toBe("2026-01-01T00:00:00.000Z");
    expect(chain.calls[0]).toMatchObject({
      signer: deployment.oracleAccount,
      contractId: deployment.boardAccount,
      methodName: "unlink_identity",
      args: { github_handle: "alice" },
    });
  });

  it("enforces the re-link cooldown when changing the NEAR account", async () => {
    const { service, advance } = setup({ cooldown: 60 });
    await service.link({
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
    });

    advance(10);
    await expect(
      service.link({ githubUserId: 42, githubLogin: "alice", nearAccount: "alice2.testnet" }),
    ).rejects.toThrow(/Wait 50 more seconds/);

    advance(60);
    const identity = await service.link({
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice2.testnet",
    });
    expect(identity.nearAccount).toBe("alice2.testnet");
  });
});
