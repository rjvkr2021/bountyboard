import { randomUUID } from "node:crypto";
import { getPlatformConfig, type PlatformConfig } from "../config";
import { validateRepoSlug } from "../naming";
import { nearAccountExists } from "../near-account";
import type {
  IdentityRecord,
  PlatformDeployment,
  PlatformEvent,
  PlatformRepository,
} from "../types";
import { NearDeploymentAdapter } from "./near-adapter";
import type { DeploymentAdapter, LaunchRequest } from "./types";
import { GithubAdminVerifier, type GithubVerifier } from "./verifier";

export interface LaunchInput {
  githubRepo: string;
  slug?: string;
  description?: string;
  budgetNear?: number;
  dailyCapNear?: number;
  githubToken?: string;
  ownerUserId?: string;
  fundingTxHash?: string;
}

export interface LaunchDependencies {
  config?: PlatformConfig;
  adapter?: DeploymentAdapter;
  verifier?: GithubVerifier;
  accountExists?: (accountId: string) => Promise<boolean>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseRepo(fullName: string): { owner: string; name: string; fullName: string } {
  const parts = fullName.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("GitHub repository must be in owner/name form");
  }
  return {
    owner: parts[0],
    name: parts[1],
    fullName: `${parts[0]}/${parts[1]}`,
  };
}

export function makeLaunchAdapter(config: PlatformConfig): DeploymentAdapter {
  return new NearDeploymentAdapter(config);
}

export function makeGithubVerifier(): GithubVerifier {
  return new GithubAdminVerifier();
}

export class LaunchService {
  private readonly config: PlatformConfig;
  private readonly adapter: DeploymentAdapter;
  private readonly verifier: GithubVerifier;
  private readonly accountExists: (accountId: string) => Promise<boolean>;

  constructor(
    private readonly store: import("../store").PlatformStore,
    dependencies: LaunchDependencies = {},
  ) {
    this.config = dependencies.config ?? getPlatformConfig();
    this.adapter = dependencies.adapter ?? makeLaunchAdapter(this.config);
    this.verifier = dependencies.verifier ?? makeGithubVerifier();
    this.accountExists =
      dependencies.accountExists ?? ((accountId) => nearAccountExists(this.config, accountId));
  }

  private assertPublicRepository(github: { fullName: string; isPrivate: boolean }): void {
    if (github.isPrivate) {
      throw new Error(
        `Only public repositories can be launched. ${github.fullName} is private.`,
      );
    }
  }

  private assertLaunchable(slug: string, githubRepoId: number): void {
    const slugCheck = validateRepoSlug(slug);
    if (!slugCheck.valid) {
      throw new Error(
        slugCheck.reason === "length"
          ? "Repository slug must be 3-32 characters"
          : "Repository slug may only contain lowercase letters, numbers, and hyphens",
      );
    }
    if (this.store.getRepositoryBySlug(slug)) {
      throw new Error(`Slug ${slug} is already reserved`);
    }
    if (this.store.getRepositoryByGithubId(githubRepoId)) {
      throw new Error("This GitHub repository has already been launched");
    }
  }

  async launch(input: LaunchInput): Promise<{
    repository: PlatformRepository;
    deployment: PlatformDeployment;
  }> {
    const parsed = parseRepo(input.githubRepo);
    if (input.slug) {
      const slugCheck = validateRepoSlug(input.slug);
      if (!slugCheck.valid) {
        throw new Error(
          slugCheck.reason === "length"
            ? "Repository slug must be 3-32 characters"
            : "Repository slug may only contain lowercase letters, numbers, and hyphens",
        );
      }
    }

    const github = await this.verifier.verify({
      owner: parsed.owner,
      repo: parsed.name,
      token: input.githubToken,
    });
    this.assertPublicRepository(github);
    const identity = this.store.getIdentityByUserId(github.viewerId);
    if (!identity) {
      throw new Error(
        "Link a NEAR account to your GitHub identity before launching a board",
      );
    }
    const founder = identity.nearAccount.trim();
    if (!(await this.accountExists(founder))) {
      throw new Error(
        `Linked NEAR account ${founder} does not exist on ${this.config.network}`,
      );
    }
    const requestedSlug =
      input.slug ??
      parsed.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);

    if (
      input.fundingTxHash &&
      this.store
        .listDeployments()
        .some(
          (deployment) =>
            deployment.fundingTxHash === input.fundingTxHash &&
            deployment.status !== "failed",
        )
    ) {
      throw new Error("This launch funding transaction has already been used");
    }

    const now = nowIso();
    const existing =
      this.store.getRepositoryByGithubId(github.repoId) ??
      this.store.getRepositoryBySlug(requestedSlug);
    let repository: PlatformRepository;
    let slug: string;

    if (existing) {
      if (existing.githubRepoId !== github.repoId) {
        throw new Error(`Slug ${requestedSlug} is already reserved`);
      }
      if (this.store.getDeploymentByRepositoryId(existing.id)) {
        throw new Error("This GitHub repository has already been launched");
      }
      if (
        existing.ownerUserId &&
        input.ownerUserId &&
        existing.ownerUserId !== input.ownerUserId
      ) {
        throw new Error("This repository is owned by another account");
      }

      slug = input.slug ?? existing.slug;
      if (slug !== existing.slug) {
        const slugCheck = validateRepoSlug(slug);
        if (!slugCheck.valid) {
          throw new Error(
            slugCheck.reason === "length"
              ? "Repository slug must be 3-32 characters"
              : "Repository slug may only contain lowercase letters, numbers, and hyphens",
          );
        }
        const slugOwner = this.store.getRepositoryBySlug(slug);
        if (slugOwner && slugOwner.id !== existing.id) {
          throw new Error(`Slug ${slug} is already reserved`);
        }
      }

      repository = {
        ...existing,
        owner: parsed.owner,
        name: parsed.name,
        fullName: parsed.fullName,
        slug,
        description: input.description?.trim() || existing.description,
        defaultBranch: github.defaultBranch,
        isPrivate: github.isPrivate,
        verificationSource: "github_app",
        verified: true,
        launchedBy: founder,
        ownerUserId: existing.ownerUserId ?? input.ownerUserId ?? null,
        updatedAt: now,
      };
    } else {
      this.assertLaunchable(requestedSlug, github.repoId);
      slug = requestedSlug;
      repository = {
        id: randomUUID(),
        githubRepoId: github.repoId,
        owner: parsed.owner,
        name: parsed.name,
        fullName: parsed.fullName,
        slug,
        description: input.description?.trim() || `${parsed.fullName} bounty board`,
        defaultBranch: github.defaultBranch,
        isPrivate: github.isPrivate,
        verificationSource: "github_app",
        verified: true,
        launchedBy: founder,
        ownerUserId: input.ownerUserId ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    let deployment: PlatformDeployment = {
      id: randomUUID(),
      repositoryId: repository.id,
      slug,
      network: this.config.network,
      status: "pending",
      rootAccount: this.config.rootAccount,
      daoAccount: "",
      boardAccount: "",
      oracleAccount: "",
      founderAccount: founder,
      wasmHash: "",
      launchBlockHeight: null,
      txHashes: [],
      council: [founder],
      fundingTxHash: input.fundingTxHash ?? null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    const budgetNear = input.budgetNear ?? this.config.defaultBudgetNear;
    const dailyCapNear = input.dailyCapNear ?? this.config.defaultDailyCapNear;
    if (!(budgetNear > 0) || !Number.isFinite(budgetNear)) {
      throw new Error("Budget must be greater than zero");
    }
    if (!(dailyCapNear > 0) || !Number.isFinite(dailyCapNear)) {
      throw new Error("Daily cap must be greater than zero");
    }

    try {
      deployment = await this.store.insertDeployment({ ...deployment, status: "verifying" });
      deployment = await this.store.updateDeployment(deployment.id, { status: "deploying" });

      const launchRequest: LaunchRequest = {
        repository,
        slug,
        founderAccount: founder,
        github,
        budgetNear,
        dailyCapNear,
      };
      const result = await this.adapter.launch(launchRequest).catch(async (error: unknown) => {
        await this.store.updateDeployment(deployment.id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });

      if (existing) {
        await this.store.updateRepository(existing.id, repository);
      } else {
        await this.store.insertRepository(repository);
      }
      deployment = await this.store.updateDeployment(deployment.id, {
        status: "active",
        daoAccount: result.accounts.dao,
        boardAccount: result.accounts.board,
        oracleAccount: result.accounts.oracle,
        wasmHash: result.wasmHash,
        launchBlockHeight: result.launchBlockHeight,
        txHashes: result.txHashes,
        council: result.council,
        error: null,
      });
      await this.store.upsertBoard(result.board);
      for (const issue of result.issues) await this.store.upsertIssue(issue);
      if (result.identity) await this.store.upsertIdentity(result.identity);
      for (const event of result.events) {
        await this.store.appendEvent({
          ...event,
          id: randomUUID(),
          ingestedAt: nowIso(),
        } satisfies PlatformEvent);
      }
      if (result.launchBlockHeight !== null) {
        await this.store.setCursor({
          boardAccount: result.accounts.board,
          blockHeight: result.launchBlockHeight,
          blockHash: "",
          updatedAt: nowIso(),
        });
      }
      return { repository, deployment };
    } catch (error) {
      if (this.store.getDeploymentById(deployment.id)?.status !== "failed") {
        await this.store.updateDeployment(deployment.id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }
}

export type { IdentityRecord };
