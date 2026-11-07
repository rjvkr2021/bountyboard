"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { Badge, EmptyPanel, ErrorPanel } from "@/components/ui";
import { formatTimestamp, shortenAccount, shortenHash } from "@/lib/format";
import type {
  BootstrapSnapshot,
  CandidateSnapshot,
  CouncilRequestSnapshot,
  GovernanceConfigSnapshot,
  MaintainerSnapshot,
  TierCounts,
} from "@/lib/platform/types";

interface Reputation {
  completed: number;
  totalEarned: string;
  points: number;
  hasS1OrS0: boolean;
  completedByTier: TierCounts;
  payoutIds: number[];
}

interface GovernancePanelProps {
  slug: string;
  boardAccount: string;
  daoAccount: string;
  network: "testnet" | "mainnet";
  maintainers: Record<string, MaintainerSnapshot>;
  governanceConfig?: GovernanceConfigSnapshot | null;
  bootstrap?: BootstrapSnapshot | null;
  candidates?: CandidateSnapshot[];
  councilRequests?: CouncilRequestSnapshot[];
}

const DEFAULT_CONFIG: GovernanceConfigSnapshot = {
  maintainerChallengeSecs: 604_800,
  councilPromotionMinTenureSecs: 604_800,
  councilPromotionDelaySecs: 604_800,
  councilPromotionMinApprovals: 2,
  councilRoleName: "council",
};

const GAS = {
  simple: "100000000000000",
  async: "300000000000000",
};

const MAINTAINER_REQUIRED: TierCounts = { s0: 1, s1: 2, s2: 3, s3: 4 };
const COUNCIL_REQUIRED: TierCounts = { s0: 2, s1: 4, s2: 6, s3: 8 };
const ZERO_COUNTS: TierCounts = { s0: 0, s1: 0, s2: 0, s3: 0 };

function addCounts(left: TierCounts, right: TierCounts): TierCounts {
  return {
    s0: left.s0 + right.s0,
    s1: left.s1 + right.s1,
    s2: left.s2 + right.s2,
    s3: left.s3 + right.s3,
  };
}

function meetsCounts(actual: TierCounts, required: TierCounts): boolean {
  return (
    actual.s0 >= required.s0 &&
    actual.s1 >= required.s1 &&
    actual.s2 >= required.s2 &&
    actual.s3 >= required.s3
  );
}

function countsLabel(actual: TierCounts, required: TierCounts): string {
  return `S0 ${actual.s0}/${required.s0} · S1 ${actual.s1}/${required.s1} · S2 ${actual.s2}/${required.s2} · S3 ${actual.s3}/${required.s3}`;
}

function timestampNanos(value: string): bigint {
  if (/^\d+$/.test(value)) return BigInt(value);
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? BigInt(millis) * 1_000_000n : 0n;
}

function nowNanos(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function transactionHash(value: unknown): string {
  const outcome = value as { transaction?: { hash?: unknown } } | null;
  return typeof outcome?.transaction?.hash === "string" ? outcome.transaction.hash : "";
}

export function GovernancePanel(props: GovernancePanelProps) {
  const router = useRouter();
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState("");
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [reputationLoading, setReputationLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [targetAccount, setTargetAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const config = props.governanceConfig ?? DEFAULT_CONFIG;
  const candidates = (props.candidates ?? []).filter(
    (candidate) => !props.maintainers[candidate.account],
  );
  const councilRequests = props.councilRequests ?? [];
  const bootstrap = props.bootstrap ?? null;
  const maintainer = accountId ? props.maintainers[accountId] ?? null : null;
  const ownCandidate = accountId
    ? candidates.find((candidate) => candidate.account === accountId) ?? null
    : null;
  const ownCouncilRequest = accountId
    ? councilRequests.find((request) => request.account === accountId) ?? null
    : null;

  async function loadReputation(account: string) {
    setReputationLoading(true);
    try {
      const response = await fetch(
        `/api/platform/repos/${encodeURIComponent(props.slug)}/reputation?account=${encodeURIComponent(account)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | { reputation?: Reputation; error?: string }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not load reputation");
      setReputation(body?.reputation ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load reputation");
      setReputation(null);
    } finally {
      setReputationLoading(false);
    }
  }

  async function ensureWallet(): Promise<{ wallet: NearWalletBase; accountId: string }> {
    if (walletRef.current && accountId) return { wallet: walletRef.current, accountId };

    const { NearConnector: Connector } = await import("@hot-labs/near-connect");
    if (!connectorRef.current) {
      connectorRef.current = new Connector({
        network: props.network,
        features: { signAndSendTransaction: true },
      });
    }
    const connector = connectorRef.current;

    let wallet: NearWalletBase | null = null;
    let selectedAccount = "";
    try {
      const connected = await connector.getConnectedWallet();
      wallet = connected.wallet;
      selectedAccount = connected.accounts[0]?.accountId ?? "";
    } catch {
      // Not connected yet.
    }

    if (!wallet || !selectedAccount) {
      wallet = await connector.connect();
      const accounts = await wallet.getAccounts();
      selectedAccount = accounts[0]?.accountId ?? "";
    }

    if (!wallet || !selectedAccount) throw new Error("No NEAR wallet account was selected");
    walletRef.current = wallet;
    setAccountId(selectedAccount);
    void loadReputation(selectedAccount);
    return { wallet, accountId: selectedAccount };
  }

  async function syncBoard() {
    await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
    router.refresh();
    if (accountId) await loadReputation(accountId);
  }

  async function send(
    label: string,
    receiverId: string,
    methodName: string,
    args: Record<string, unknown>,
    gas: string,
  ) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const { wallet, accountId: signerAccount } = await ensureWallet();
      const outcome = await wallet.signAndSendTransaction({
        receiverId,
        signerId: signerAccount,
        network: props.network,
        actions: [
          {
            type: "FunctionCall",
            params: { methodName, args, gas, deposit: "0" },
          },
        ],
      });
      const hash = transactionHash(outcome);
      setNotice(`${label} submitted${hash ? ` (${shortenHash(hash, 10, 8)})` : ""}. Syncing chain state.`);
      await syncBoard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      await ensureWallet();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect wallet");
    } finally {
      setBusy(null);
    }
  }

  const isCouncil = Boolean(maintainer?.council_derived);
  const councilCooldownReady =
    !ownCouncilRequest || nowNanos() >= timestampNanos(ownCouncilRequest.retryAt);
  const contributions = reputation?.completedByTier ?? ZERO_COUNTS;
  const involvement = addCounts(maintainer?.closed_by_tier ?? ZERO_COUNTS, contributions);
  const reputationMeetsMaintainer = meetsCounts(contributions, MAINTAINER_REQUIRED);
  const councilCountsMet = meetsCounts(involvement, COUNCIL_REQUIRED);
  const canRequestCouncil =
    Boolean(maintainer) &&
    !isCouncil &&
    councilCountsMet &&
    !ownCouncilRequest?.activeProposalId &&
    councilCooldownReady;

  return (
    <div className="space-y-5 text-xs leading-5">
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          {notice}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2">
        <Badge tone={accountId ? "accent" : "neutral"}>
          {accountId ? "Wallet connected" : "Wallet not connected"}
        </Badge>
        {accountId ? (
          <span className="font-mono">{shortenAccount(accountId, 12, 8)}</span>
        ) : (
          <span className="text-muted">Connect to check promotion eligibility and sign actions.</span>
        )}
        {!accountId ? (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy !== null}
            className="ml-auto rounded-full border border-line px-3 py-1.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === "connect" ? "Connecting…" : "Connect wallet"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void syncBoard()}
            disabled={busy !== null}
            className="ml-auto rounded-full border border-line px-3 py-1.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Refresh chain state
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Bootstrap</p>
          <p className="mt-1 font-semibold">
            {bootstrap ? (bootstrap.ended ? "Ended" : bootstrap.active ? "Active" : "Pending") : "Unknown"}
          </p>
          <p className="mt-1 text-muted">
            {bootstrap
              ? `${bootstrap.maintainersLen} / ${bootstrap.threshold} maintainers`
              : "Run the indexer to load governance state"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Maintainer path</p>
          <p className="mt-1 font-semibold">1 S0 · 2 S1 · 3 S2 · 4 S3</p>
          <p className="mt-1 text-muted">Closed PRs · challenge {formatDuration(config.maintainerChallengeSecs)}</p>
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Council path</p>
          <p className="mt-1 font-semibold">2 S0 · 4 S1 · 6 S2 · 8 S3</p>
          <p className="mt-1 text-muted">Involved closed PRs · DAO {config.councilRoleName} vote</p>
        </div>
      </div>

      {accountId ? (
        <div className="rounded-xl border border-line bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">Your governance progress</p>
            {maintainer ? <Badge tone="accent">Maintainer</Badge> : null}
            {isCouncil ? <Badge tone="accent">Council</Badge> : null}
            {ownCandidate ? <Badge tone="warn">Candidate</Badge> : null}
          </div>

          {reputationLoading ? (
            <p className="mt-2 text-muted">Loading reputation…</p>
          ) : reputation ? (
            <div className="mt-2 flex flex-wrap gap-4 text-muted">
              <span>{reputation.completed} closed PRs</span>
              <span>{countsLabel(contributions, MAINTAINER_REQUIRED)}</span>
            </div>
          ) : null}

          {ownCandidate ? (
            <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-2">
              <p className="font-semibold">
                {ownCandidate.vetoed
                  ? "Your candidacy was vetoed by the DAO."
                  : nowNanos() >= timestampNanos(ownCandidate.challengeUntil)
                    ? "Your challenge period is complete."
                    : `Challenge ends ${formatTimestamp(ownCandidate.challengeUntil)}.`}
              </p>
              {!ownCandidate.vetoed && nowNanos() >= timestampNanos(ownCandidate.challengeUntil) ? (
                <button
                  type="button"
                  onClick={() =>
                    void send(
                      "Maintainer promotion",
                      props.boardAccount,
                      "promote",
                      { candidate: accountId },
                      GAS.simple,
                    )
                  }
                  disabled={busy !== null}
                  className="mt-2 rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {busy === "Maintainer promotion" ? "Promoting…" : "Promote to maintainer"}
                </button>
              ) : null}
            </div>
          ) : !maintainer ? (
            <p className="mt-2 text-muted">
              {reputationMeetsMaintainer
                ? "You meet the closed-PR thresholds. The candidate is created automatically after a settled payout; run Refresh chain state."
                : `Maintainer threshold: ${countsLabel(contributions, MAINTAINER_REQUIRED)}.`}
            </p>
          ) : null}

          {maintainer ? (
            <div className="mt-3 space-y-2 text-muted">
              <p>
                {councilCountsMet ? "Council threshold met" : "Council involvement"}
                {" · "}
                {countsLabel(involvement, COUNCIL_REQUIRED)}
              </p>
              {ownCouncilRequest ? (
                <p>
                  Council request:{" "}
                  {ownCouncilRequest.activeProposalId
                    ? `DAO proposal #${ownCouncilRequest.activeProposalId}`
                    : councilCooldownReady
                      ? "ready again"
                      : `cooldown until ${formatTimestamp(ownCouncilRequest.retryAt)}`}
                </p>
              ) : null}
              {canRequestCouncil ? (
                <button
                  type="button"
                  onClick={() =>
                    void send(
                      "Council promotion request",
                      props.boardAccount,
                      "request_council_promotion",
                      {},
                      GAS.async,
                    )
                  }
                  disabled={busy !== null}
                  className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {busy === "Council promotion request" ? "Submitting request…" : `Request ${config.councilRoleName} promotion`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {isCouncil ? (
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="font-semibold text-foreground">Council actions</p>
          <p className="mt-1 text-muted">
            Promote any NEAR account directly to maintainer, or start a DAO {config.councilRoleName}{" "}
            proposal for a new council member.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              value={targetAccount}
              onChange={(event) => setTargetAccount(event.target.value.trim())}
              placeholder="Near account ID"
              className="min-w-56 flex-1 rounded-full border border-line bg-panel px-4 py-2 text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={busy !== null || !targetAccount}
              onClick={() =>
                void send(
                  "Council maintainer promotion",
                  props.boardAccount,
                  "council_promote_maintainer",
                  { account: targetAccount },
                  GAS.simple,
                )
              }
              className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy === "Council maintainer promotion" ? "Promoting…" : "Promote to maintainer"}
            </button>
            <button
              type="button"
              disabled={busy !== null || !targetAccount}
              onClick={() =>
                void send(
                  "Council member proposal",
                  props.boardAccount,
                  "council_promote_council_member",
                  { account: targetAccount },
                  GAS.async,
                )
              }
              className="rounded-full border border-line px-4 py-2 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy === "Council member proposal" ? "Proposing…" : "Add council member"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void send(
                  "Sync council roster",
                  props.boardAccount,
                  "sync_council_maintainers",
                  {},
                  GAS.async,
                )
              }
              className="rounded-full border border-line px-4 py-2 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy === "Sync council roster" ? "Syncing…" : "Sync council roster"}
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-foreground">Maintainer candidates</p>
          <span className="text-muted">{candidates.length}</span>
        </div>
        <div className="mt-2 space-y-2">
          {candidates.length === 0 ? (
            <EmptyPanel>No maintainer candidates yet.</EmptyPanel>
          ) : (
            candidates.map((candidate) => {
              const mature = nowNanos() >= timestampNanos(candidate.challengeUntil);
              return (
                <div
                  key={candidate.account}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2"
                >
                  <span className="font-mono">{candidate.account}</span>
                  {candidate.vetoed ? <Badge tone="danger">vetoed</Badge> : null}
                  <span className="text-muted">
                    {countsLabel(candidate.completedByTier, MAINTAINER_REQUIRED)}
                  </span>
                  <span className="ml-auto text-muted">
                    {candidate.vetoed
                      ? "Promotion blocked"
                      : mature
                        ? "Challenge complete"
                        : `Challenge ends ${formatTimestamp(candidate.challengeUntil)}`}
                  </span>
                  {!candidate.vetoed && mature ? (
                    <button
                      type="button"
                      onClick={() =>
                        void send(
                          `Promote ${candidate.account}`,
                          props.boardAccount,
                          "promote",
                          { candidate: candidate.account },
                          GAS.simple,
                        )
                      }
                      disabled={busy !== null}
                      className="rounded-full border border-line px-3 py-1.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {busy === `Promote ${candidate.account}` ? "Promoting…" : "Promote"}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-foreground">Council requests</p>
          <span className="text-muted">{councilRequests.length}</span>
        </div>
        <div className="mt-2 space-y-2">
          {councilRequests.length === 0 ? (
            <EmptyPanel>No council promotion requests yet.</EmptyPanel>
          ) : (
            councilRequests.map((request) => (
              <div
                key={request.account}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2"
              >
                <span className="font-mono">{request.account}</span>
                <Badge tone={request.activeProposalId ? "warn" : "neutral"}>
                  {request.activeProposalId ? `DAO proposal #${request.activeProposalId}` : "synced/idle"}
                </Badge>
                <span className="ml-auto text-muted">Retry {formatTimestamp(request.retryAt)}</span>
                {request.activeProposalId ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void send(
                          `Council vote for ${request.account}`,
                          props.daoAccount,
                          "act_proposal",
                          {
                            id: request.activeProposalId,
                            action: "VoteApprove",
                            memo: `BountyBoard council promotion for ${request.account}`,
                          },
                          GAS.async,
                        )
                      }
                      disabled={busy !== null || !accountId}
                      className="rounded-full bg-foreground px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                    >
                      {busy === `Council vote for ${request.account}` ? "Voting…" : "Vote approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void send(
                          `Sync council request ${request.account}`,
                          props.boardAccount,
                          "sync_council_request",
                          { account: request.account },
                          GAS.simple,
                        )
                      }
                      disabled={busy !== null}
                      className="rounded-full border border-line px-3 py-1.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      Sync
                    </button>
                  </>
                ) : null}
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-muted">
          The DAO vote must be cast by a council member. Sync after the vote to refresh the board
          request state.
        </p>
      </div>
    </div>
  );
}
