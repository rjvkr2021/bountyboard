import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import type { PlatformConfig } from "../config";
import { nearToYocto } from "../../format";
import { platformAccountNames } from "../naming";
import type {
  BoardSnapshot,
  PlatformEvent,
} from "../types";
import { JsonRpcNearChain, generateAccountKey, type NearChain } from "./near-chain";
import { launchFundingRequirement } from "./funding";
import { buildLaunchPolicy } from "./policy";
import type { DeploymentAdapter, LaunchRequest, LaunchResult } from "./types";

const DAO_GAS = 300_000_000_000_000n;
const PROPOSAL_ACTION_GAS = 100_000_000_000_000n;

function nowIso(): string {
  return new Date().toISOString();
}

function yocto(near: number): string {
  return nearToYocto(String(near));
}

function utf8ToBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function functionCallKind(
  receiverId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit = 0n,
): Record<string, unknown> {
  return {
    FunctionCall: {
      receiver_id: receiverId,
      actions: [
        {
          method_name: methodName,
          args: utf8ToBase64(JSON.stringify(args)),
          deposit: deposit.toString(),
          gas: PROPOSAL_ACTION_GAS.toString(),
        },
      ],
    },
  };
}

export class NearDeploymentAdapter implements DeploymentAdapter {
  constructor(
    private readonly config: PlatformConfig,
    private readonly chain: NearChain = new JsonRpcNearChain({
      rpcUrl: config.rpcUrl,
      deployerAccount: config.near.deployerAccount,
      deployerPrivateKey: config.near.deployerPrivateKey,
    }),
  ) {}

  private async waitForProposal(proposalId: number): Promise<void> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const proposal = await this.chain.view<{ status: string }>(
        this.dao(),
        "get_proposal",
        { id: proposalId },
      );
      if (proposal.status === "Executed" || proposal.status === "Approved") return;
      if (["Failed", "Rejected", "Removed", "Expired"].includes(proposal.status)) {
        throw new Error(`DAO proposal ${proposalId} ended with ${proposal.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`Timed out waiting for DAO proposal ${proposalId}`);
  }

  private daoAccount = "";

  private dao(): string {
    return this.daoAccount;
  }

  private async executeProposal(
    kind: Record<string, unknown>,
    description: string,
  ): Promise<string> {
    const created = await this.chain.callWithResult(
      this.config.near.deployerAccount,
      this.config.near.deployerPrivateKey,
      this.dao(),
      "add_proposal",
      { proposal: { description, kind } },
      {
        deposit: BigInt(nearToYocto(this.config.near.proposalBondNear)),
        gas: DAO_GAS,
      },
    );
    const proposalId = Number(created.result);
    const voteTx = String(
      await this.chain.call(
        this.config.near.deployerAccount,
        this.config.near.deployerPrivateKey,
        this.dao(),
        "act_proposal",
        { id: proposalId, action: "VoteApprove", memo: null },
        { gas: DAO_GAS },
      ),
    );
    await this.waitForProposal(proposalId);
    return voteTx;
  }

  async launch(request: LaunchRequest): Promise<LaunchResult> {
    const near = this.config.near;
    if (!near.deployerAccount || !near.deployerPrivateKey) {
      throw new Error("PLATFORM_DEPLOYER_ACCOUNT and PLATFORM_DEPLOYER_PRIVATE_KEY are required");
    }
    if (!near.oraclePublicKey) {
      throw new Error("PLATFORM_ORACLE_PUBLIC_KEY is required");
    }
    await access(near.boardWasm);
    await access(near.sputnikWasm);
    const wasmHash = createHash("sha256")
      .update(await readFile(near.boardWasm))
      .digest("hex");
    const funding = await launchFundingRequirement(this.config, request.budgetNear);

    const accounts = platformAccountNames(request.slug, this.config.rootAccount);
    this.daoAccount = accounts.dao;
    const daoKey = generateAccountKey();
    const boardKey = generateAccountKey();
    const txHashes: string[] = [];

    txHashes.push(
      String(await this.chain.createSubAccount(accounts.dao, daoKey.publicKey, funding.daoFundingYocto)),
    );
    txHashes.push(
      String(await this.chain.createSubAccount(accounts.board, boardKey.publicKey, funding.boardFundingYocto)),
    );
    txHashes.push(
      String(await this.chain.createSubAccount(accounts.oracle, near.oraclePublicKey, funding.oracleFundingYocto)),
    );
    txHashes.push(String(await this.chain.deploy(accounts.dao, daoKey.secretKey, near.sputnikWasm)));
    txHashes.push(String(await this.chain.deploy(accounts.board, boardKey.secretKey, near.boardWasm)));

    const bootstrapPolicy = buildLaunchPolicy({
      council: [near.deployerAccount],
      bountyboard: accounts.board,
      proposalBondNear: near.proposalBondNear,
      bountyBondNear: near.bountyBondNear,
      proposalPeriodSecs: near.proposalPeriodSecs,
      bountyForgivenessPeriodSecs: near.bountyForgivenessSecs,
    });
    txHashes.push(
      String(await this.chain.call(accounts.dao, daoKey.secretKey, accounts.dao, "new", {
        config: {
          name: `BountyBoard: ${request.repository.fullName}`,
          purpose: request.repository.description || "Fund open-source bounties.",
          metadata: "",
        },
        policy: bootstrapPolicy,
      })),
    );
    txHashes.push(
      String(await this.chain.call(accounts.board, boardKey.secretKey, accounts.board, "new", {
        dao: accounts.dao,
        config: {
          bootstrap_until_maintainers: this.config.bootstrapUntilMaintainers,
          maintainer_challenge_secs: 604_800,
          council_promotion_min_tenure_secs: 604_800,
          council_promotion_delay_secs: 604_800,
          council_promotion_min_approvals: 2,
          council_role_name: "council",
          payout_bond_required: false,
        },
      })),
    );
    txHashes.push(String(await this.chain.deleteKey(accounts.dao, daoKey.secretKey, daoKey.publicKey)));
    txHashes.push(String(await this.chain.deleteKey(accounts.board, boardKey.secretKey, boardKey.publicKey)));

    const repoAddTx = await this.executeProposal(
        functionCallKind(accounts.board, "add_repo", {
          github_repo: request.repository.fullName,
          maintainers: [request.founderAccount],
          oracle: accounts.oracle,
          metadata: {
            github_repo_id: request.repository.githubRepoId,
            verification_source: "github_app",
          },
        }),
        `Launch ${request.repository.fullName} on BountyBoard`,
      );
    txHashes.push(repoAddTx);
    txHashes.push(
      await this.executeProposal(
        functionCallKind(accounts.board, "set_budget", {
          repo_id: 0,
          amount: yocto(request.budgetNear),
        }),
        `Set initial budget for ${request.repository.fullName}`,
      ),
    );
    txHashes.push(
      String(
        await this.chain.call(
          near.deployerAccount,
          near.deployerPrivateKey,
          accounts.board,
          "sync_dao_params",
          {},
        ),
      ),
    );

    let identity = null;
    if (near.oraclePrivateKey) {
      txHashes.push(
        String(
          await this.chain.call(
            accounts.oracle,
            near.oraclePrivateKey,
            accounts.board,
            "link_identity_with_id",
            {
              github_handle: request.github.viewerLogin,
              github_user_id: request.github.viewerId,
              near_account: request.founderAccount,
            },
          ),
        ),
      );
      identity = {
        githubUserId: request.github.viewerId,
        githubLogin: request.github.viewerLogin,
        nearAccount: request.founderAccount,
        source: "github_app" as const,
        linkedAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    const finalPolicy = buildLaunchPolicy({
      council: [request.founderAccount],
      bountyboard: accounts.board,
      proposalBondNear: near.proposalBondNear,
      bountyBondNear: near.bountyBondNear,
      proposalPeriodSecs: near.proposalPeriodSecs,
      bountyForgivenessPeriodSecs: near.bountyForgivenessSecs,
    });
    txHashes.push(
      await this.executeProposal(
        { ChangePolicy: { policy: finalPolicy } },
        `Transfer council control to ${request.founderAccount}`,
      ),
    );

    const now = nowIso();
    const board: BoardSnapshot = {
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
      budget: yocto(request.budgetNear),
      committed: "0",
      dailyCap: yocto(request.dailyCapNear),
      paused: false,
      bootstrapEnded: this.config.bootstrapUntilMaintainers <= 1,
      bootstrapUntilMaintainers: this.config.bootstrapUntilMaintainers,
      payoutBondRequired: false,
      governanceConfig: {
        maintainerChallengeSecs: 604_800,
        councilPromotionMinTenureSecs: 604_800,
        councilPromotionDelaySecs: 604_800,
        councilPromotionMinApprovals: 2,
        councilRoleName: "council",
      },
      bootstrap: {
        active:
          this.config.bootstrapUntilMaintainers > 1 &&
          1 < this.config.bootstrapUntilMaintainers,
        maintainersLen: 1,
        threshold: this.config.bootstrapUntilMaintainers,
        ended: this.config.bootstrapUntilMaintainers <= 1,
      },
      candidates: [],
      councilRequests: [],
      updatedAt: now,
    };
    const events: Array<Omit<PlatformEvent, "id" | "ingestedAt">> = [
      {
        boardAccount: accounts.board,
        type: "repo_added",
        payload: {
          repo_id: 0,
          github_repo: request.repository.fullName,
          github_repo_id: request.repository.githubRepoId,
          verification_source: "github_app",
          maintainers: [request.founderAccount],
          oracle: accounts.oracle,
        },
        txHash: repoAddTx,
        blockHeight: 0,
        occurredAt: now,
      },
    ];

    return {
      accounts: { root: this.config.rootAccount, ...accounts },
      wasmHash,
      launchBlockHeight: null,
      txHashes: txHashes.filter((hash) => hash && hash !== "null"),
      council: [request.founderAccount],
      board,
      issues: [],
      events,
      identity,
      oraclePublicKey: near.oraclePublicKey,
    };
  }
}
