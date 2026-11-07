"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { Badge, ErrorPanel } from "@/components/ui";
import { nearToYocto, shortenAccount, shortenHash } from "@/lib/format";
import type { MaintainerSnapshot } from "@/lib/platform/types";

interface IssueActionsProps {
  slug: string;
  issueId: number;
  issueNumber: number | null;
  boardAccount: string;
  daoAccount: string;
  network: "testnet" | "mainnet";
  tier: string;
  status: string;
  kind: "PublicIssue" | "PrivateSecurity";
  claimants: string[];
  maintainers: Record<string, MaintainerSnapshot>;
  mergeProofAuthorAccount: string | null;
  nativeBountyId: number | null;
  nativeBountyStatus: string | null;
  privateRecipientAccount: string | null;
  proposalBondNear: string;
  bountyBondNear: string;
  payoutBondRequired: boolean;
  githubConnected: boolean;
}

const CLAIM_TERMINAL = new Set([
  "Merged",
  "PayoutRequested",
  "PayoutPending",
  "PayoutProcessing",
  "PayoutFailed",
  "Paid",
  "Cancelled",
  "Refunded",
]);

const GAS = {
  default: "100000000000000",
  payout: "300000000000000",
};

function transactionHash(value: unknown): string {
  const outcome = value as { transaction?: { hash?: unknown } } | null;
  return typeof outcome?.transaction?.hash === "string" ? outcome.transaction.hash : "";
}

function shortAccount(accountId: string): string {
  return accountId.length <= 24 ? accountId : shortenAccount(accountId, 12, 8);
}

export function IssueActions(props: IssueActionsProps) {
  const router = useRouter();
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isMaintainer = Boolean(accountId && props.maintainers[accountId]);
  const isClaimant = Boolean(accountId && props.claimants.includes(accountId));
  const s0Ready = props.tier !== "S0" || props.nativeBountyId !== null;
  const canClaim =
    props.kind === "PublicIssue" && s0Ready && !CLAIM_TERMINAL.has(props.status) && !isClaimant;
  const canApprove = props.status === "PendingApproval";
  const canSubmitMerge =
    props.status === "Approved" && props.kind === "PublicIssue" && props.issueNumber !== null;
  const cancellationStatus = ["PendingApproval", "Approved", "Escalated"].includes(props.status);
  const canRequestPayout =
    props.status === "Merged" &&
    ((props.kind === "PublicIssue" && props.tier !== "S0") ||
      (props.kind === "PrivateSecurity" &&
        Boolean(props.privateRecipientAccount) &&
        props.privateRecipientAccount === accountId));
  const canCancel =
    isMaintainer &&
    cancellationStatus &&
    (props.kind === "PrivateSecurity" || (props.kind === "PublicIssue" && props.tier !== "S0"));

  async function ensureWallet(): Promise<{ wallet: NearWalletBase; accountId: string }> {
    if (walletRef.current && accountId) {
      return { wallet: walletRef.current, accountId };
    }

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
    return { wallet, accountId: selectedAccount };
  }

  async function syncBoard() {
    await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
    router.refresh();
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

  async function sendTransaction(
    method: "claim" | "approve" | "request_payout" | "mark_spam" | "cancel_bounty",
    label: string,
    deposit = "0",
    gas = GAS.default,
  ) {
    setBusy(method);
    setError(null);
    setNotice(null);
    try {
      const { wallet, accountId: signerAccount } = await ensureWallet();
      if (method === "claim" && props.tier === "S0" && props.nativeBountyId !== null) {
        if (props.nativeBountyStatus !== "Claimed" && props.nativeBountyStatus !== "Done") {
          await wallet.signAndSendTransaction({
            receiverId: props.daoAccount,
            signerId: signerAccount,
            network: props.network,
            actions: [
              {
                type: "FunctionCall",
                params: {
                  methodName: "bounty_claim",
                  args: { id: props.nativeBountyId, deadline: "2592000000000000" },
                  gas: GAS.payout,
                  deposit: nearToYocto(props.bountyBondNear),
                },
              },
            ],
          });
        }
      }
      const outcome = await wallet.signAndSendTransaction({
        receiverId: props.boardAccount,
        signerId: signerAccount,
        network: props.network,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: method,
              args: { issue_id: props.issueId },
              gas,
              deposit,
            },
          },
        ],
      });
      const hash = transactionHash(outcome);
      setNotice(`${label} submitted${hash ? ` (${shortenHash(hash, 10, 8)})` : ""}. Syncing board state.`);
      await syncBoard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function submitMergeProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = Number(prNumber);
    if (!Number.isInteger(number) || number <= 0) {
      setError("Enter a valid pull request number");
      return;
    }

    setBusy("merge");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/platform/issues/${encodeURIComponent(props.slug)}/${props.issueId}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prNumber: number }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { pr?: { number: number }; error?: string }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not record merge proof");
      setNotice(`Merge proof recorded for pull request #${body?.pr?.number ?? number}.`);
      setPrNumber("");
      router.refresh();
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : "Could not record merge proof");
    } finally {
      setBusy(null);
    }
  }

  const claimLabel = isClaimant ? "You claimed this bounty" : "Claim bounty";

  return (
    <div className="space-y-4 text-xs leading-5">
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
        {accountId ? <span className="font-mono">{shortAccount(accountId)}</span> : null}
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
          <span className="ml-auto text-muted">
            {isMaintainer ? "Maintainer" : isClaimant ? "Claimant" : "Contributor"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canClaim || isClaimant ? (
          <button
            type="button"
            onClick={() => void sendTransaction("claim", "Claim")}
            disabled={busy !== null || isClaimant || props.kind !== "PublicIssue" || !s0Ready}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "claim" ? "Claiming…" : claimLabel}
          </button>
        ) : null}
        {props.tier === "S0" && !s0Ready ? (
          <span className="self-center text-muted">
            S0 claims unlock after the native bounty is registered.
          </span>
        ) : null}
        {props.tier === "S0" && s0Ready && canClaim ? (
          <span className="self-center text-muted">
            S0 claim requires a {props.bountyBondNear} NEAR native bounty bond.
          </span>
        ) : null}

        {canApprove ? (
          accountId ? (
            isMaintainer ? (
              <button
                type="button"
                onClick={() => void sendTransaction("approve", "Approval")}
                disabled={busy !== null}
                className="rounded-full border border-line px-4 py-2 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {busy === "approve" ? "Approving…" : "Approve bounty"}
              </button>
            ) : (
              <span className="rounded-full border border-line px-4 py-2 text-muted">
                Maintainer approval required
              </span>
            )
          ) : null
        ) : null}

        {canRequestPayout ? (
          <button
            type="button"
            onClick={() =>
              void sendTransaction(
                "request_payout",
                "Payout request",
                props.payoutBondRequired ? nearToYocto(props.proposalBondNear) : "0",
                GAS.payout,
              )
            }
            disabled={
              busy !== null ||
              (props.kind === "PrivateSecurity"
                ? !props.privateRecipientAccount
                : !props.mergeProofAuthorAccount)
            }
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "request_payout" ? "Requesting payout…" : "Request payout"}
          </button>
        ) : null}
        {canRequestPayout ? (
          <span className="self-center text-muted">
            {props.payoutBondRequired
              ? `Requires ${props.proposalBondNear} NEAR proposal bond.`
              : "The board covers the DAO proposal bond."}
          </span>
        ) : null}

        {canCancel ? (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Cancel this bounty and release its committed budget? This cannot be undone.",
                )
              ) {
                void sendTransaction(
                  props.kind === "PrivateSecurity" ? "cancel_bounty" : "mark_spam",
                  props.kind === "PrivateSecurity" ? "Private bounty cancellation" : "Bounty cancellation",
                );
              }
            }}
            disabled={busy !== null}
            className="rounded-full border border-red-200 px-4 py-2 font-semibold text-red-700 transition hover:border-red-300 disabled:opacity-50"
          >
            {busy === "mark_spam" || busy === "cancel_bounty"
              ? "Cancelling…"
              : props.kind === "PrivateSecurity"
                ? "Cancel private bounty"
                : "Cancel bounty"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void syncBoard()}
          disabled={busy !== null}
          className="rounded-full border border-line px-4 py-2 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Refresh chain state
        </button>
      </div>

      {canRequestPayout &&
      (props.kind === "PrivateSecurity"
        ? !props.privateRecipientAccount
        : !props.mergeProofAuthorAccount) ? (
        <p className="text-muted">
          Payout is blocked until the{" "}
          {props.kind === "PrivateSecurity" ? "credited researcher" : "merged PR author"} has a{" "}
          <Link href="/account#identity" className="text-accent hover:underline">
            GitHub↔NEAR identity link
          </Link>
          .
        </p>
      ) : null}
      {props.kind === "PrivateSecurity" && props.privateRecipientAccount ? (
        <p className="text-muted">
          Private payout recipient: <span className="font-mono">{props.privateRecipientAccount}</span>
        </p>
      ) : null}

      {canSubmitMerge ? (
        props.githubConnected ? (
          <form onSubmit={submitMergeProof} className="space-y-3 rounded-xl border border-line bg-background p-3">
            <div>
              <p className="font-semibold text-foreground">Record your merged pull request</p>
              <p className="mt-1 text-muted">
                The PR must be merged, authored by your GitHub account, reference issue{" "}
                #{props.issueNumber}, and you must have claimed this bounty with your linked NEAR
                account.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min={1}
                value={prNumber}
                onChange={(event) => setPrNumber(event.target.value)}
                placeholder="Pull request number"
                className="min-w-48 flex-1 rounded-full border border-line bg-panel px-4 py-2 text-xs outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={busy !== null || !prNumber}
                className="rounded-full bg-foreground px-4 py-2 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy === "merge" ? "Verifying…" : "Verify and record"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-muted">
            <Link href={`/signin?next=/r/${props.slug}/issues/${props.issueId}`} className="text-accent hover:underline">
              Sign in with GitHub
            </Link>{" "}
            to record your merged pull request.
          </p>
        )
      ) : null}
    </div>
  );
}
