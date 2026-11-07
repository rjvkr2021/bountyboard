import type { PlatformConfig } from "../config";
import { JsonRpcNearChain, type NearChain } from "../launch/near-chain";
import type { PlatformStore } from "../store";
import type { IdentityRecord, PlatformDeployment } from "../types";
import { IdentityError } from "./errors";

const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+)(\.(([a-z\d]+[-_])*[a-z\d]+))*$/;

export interface LinkIdentityInput {
  githubUserId: number;
  githubLogin: string;
  nearAccount: string;
}

export interface UnlinkIdentityInput {
  githubUserId: number;
  nearAccount: string;
}

export interface IdentityServiceDependencies {
  chain?: NearChain;
  now?: () => Date;
}

export class IdentityService {
  private readonly chain: NearChain;
  private readonly now: () => Date;

  constructor(
    private readonly store: PlatformStore,
    private readonly config: PlatformConfig,
    dependencies: IdentityServiceDependencies = {},
  ) {
    this.chain =
      dependencies.chain ??
      new JsonRpcNearChain({
        rpcUrl: config.rpcUrl,
        deployerAccount: config.near.deployerAccount,
        deployerPrivateKey: config.near.deployerPrivateKey,
      });
    this.now = dependencies.now ?? (() => new Date());
  }

  private activeBoards(): PlatformDeployment[] {
    return this.store
      .listDeployments()
      .filter(
        (deployment) =>
          deployment.status === "active" &&
          deployment.boardAccount.length > 0 &&
          deployment.oracleAccount.length > 0,
      );
  }

  private async linkBoard(
    deployment: PlatformDeployment,
    input: LinkIdentityInput,
  ): Promise<void> {
    const oracleKey = this.config.near.oraclePrivateKey;
    if (!oracleKey) {
      throw new IdentityError(500, "PLATFORM_ORACLE_PRIVATE_KEY is required to link identities");
    }
    try {
      await this.chain.call(
        deployment.oracleAccount,
        oracleKey,
        deployment.boardAccount,
        "link_identity_with_id",
        {
          github_handle: input.githubLogin,
          github_user_id: input.githubUserId,
          near_account: input.nearAccount,
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new IdentityError(
        502,
        `Could not link the identity on board ${deployment.boardAccount}: ${detail}`,
      );
    }
  }

  private async unlinkBoard(
    deployment: PlatformDeployment,
    identity: IdentityRecord,
  ): Promise<void> {
    const oracleKey = this.config.near.oraclePrivateKey;
    if (!oracleKey) {
      throw new IdentityError(500, "PLATFORM_ORACLE_PRIVATE_KEY is required to unlink identities");
    }

    const linked = await this.chain.view<string | null>(
      deployment.boardAccount,
      "get_identity",
      { github_handle: identity.githubLogin },
    );
    if (!linked) return;
    if (linked !== identity.nearAccount) {
      throw new IdentityError(
        409,
        `Board ${deployment.boardAccount} has a different NEAR account linked for this GitHub identity`,
      );
    }

    try {
      await this.chain.call(
        deployment.oracleAccount,
        oracleKey,
        deployment.boardAccount,
        "unlink_identity",
        { github_handle: identity.githubLogin },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new IdentityError(
        502,
        `Could not unlink the identity on board ${deployment.boardAccount}: ${detail}`,
      );
    }
  }

  async link(input: LinkIdentityInput): Promise<IdentityRecord> {
    const nearAccount = input.nearAccount.trim();
    if (!NEAR_ACCOUNT_RE.test(nearAccount) || nearAccount.length < 2 || nearAccount.length > 64) {
      throw new IdentityError(400, "Enter a valid NEAR account ID");
    }
    const githubLogin = input.githubLogin.trim();
    if (!githubLogin) {
      throw new IdentityError(400, "GitHub login is required");
    }

    const now = this.now();
    const existing = this.store.getIdentityByUserId(input.githubUserId);
    const nearOwner = this.store.getIdentityByNearAccount(nearAccount);
    if (nearOwner && nearOwner.githubUserId !== input.githubUserId) {
      throw new IdentityError(409, "That NEAR account is already linked to another GitHub identity");
    }

    if (existing && existing.nearAccount !== nearAccount) {
      for (const deployment of this.activeBoards()) {
        await this.unlinkBoard(deployment, existing);
      }
    }

    const normalized: LinkIdentityInput = { ...input, nearAccount, githubLogin };
    for (const deployment of this.activeBoards()) {
      await this.linkBoard(deployment, normalized);
    }

    const nowIso = now.toISOString();
    const identity = await this.store.upsertIdentity({
      githubUserId: input.githubUserId,
      githubLogin,
      nearAccount,
      source: "nep413",
      linkedAt: existing?.linkedAt ?? nowIso,
      updatedAt: nowIso,
    });
    return identity;
  }

  async unlink(input: UnlinkIdentityInput): Promise<IdentityRecord> {
    const existing = this.store.getIdentityByUserId(input.githubUserId);
    if (!existing) {
      throw new IdentityError(404, "This GitHub account has no linked NEAR account");
    }
    if (existing.nearAccount !== input.nearAccount) {
      throw new IdentityError(400, "Connect the NEAR account currently linked to unlink it");
    }

    for (const deployment of this.activeBoards()) {
      await this.unlinkBoard(deployment, existing);
    }

    const removed = await this.store.removeIdentity(input.githubUserId);
    if (!removed) {
      throw new IdentityError(404, "This GitHub account has no linked NEAR account");
    }
    return removed;
  }
}
