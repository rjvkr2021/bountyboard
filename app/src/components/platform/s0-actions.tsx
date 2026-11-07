"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { Badge, ErrorPanel } from "@/components/ui";
import { formatNear, nearToYocto, shortenAccount, shortenHash } from "@/lib/format";
import type { DaoBountyView, DaoProposalView } from "@/lib/platform/dao-reader";
import type { MaintainerSnapshot, S0Snapshot } from "@/lib/platform/types";

interface S0ActionsProps {
  slug: string;
  issueId: number;
  issueNumber: number | null;
  boardAccount: string;
  daoAccount: string;
  network: "testnet" | "mainnet";
  status: string;
  s0: S0Snapshot | null;
  addBountyProposal: DaoProposalView | null;
  nativeBounty: DaoBountyView | null;
  bountyDoneProposal: DaoProposalView | null;
  recipient: string | null;
  maintainers: Record<string, MaintainerSnapshot>;
  proposalBondNear: string;
}

const GAS = {
  simple: "100000000000000",
  async: "300000000000000",
};

function transactionHash(value: unknown): string {
  const outcome = value as { transaction?: { hash?: unknown } } | null;
  return typeof outcome?.transaction?.hash === "string" ? outcome.transaction.hash : "";
}

export function S0Actions(props: S0ActionsProps) {
  const router = useRouter();
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const maintainer = accountId ? props.maintainers[accountId] : null;
  const isCouncil = Boolean(maintainer?.council_derived);
  const addBountyPending = props.addBountyProposal?.status === "InProgress";
  const addBountyApproved = props.addBountyProposal?.status === "Approved";
  const registered = props.s0?.native_bounty_id != null;
  const canRegister =
    addBountyApproved && !registered && Boolean(props.nativeBounty) && props.status !== "Cancelled";
  const canCreateDone =
    props.status === "Merged" && registered && Boolean(props.recipient) && !props.bountyDoneProposal;
  const doneProposal = props.bountyDoneProposal;
  const canRecordDone = Boolean(doneProposal) && props.status === "Merged";
  const canConfirm = props.status === "PayoutPending";

  async function ensureWallet(): Promise<{ wallet: NearWalletBase; accountId: string }> {
    if (wallet && accountId) return { wallet, accountId };
    const { NearConnector: Connector } = await import("@hot-labs/near-connect");
    const nextConnector =
      connector ??
      new Connector({
        network: props.network,
        features: { signAndSendTransaction: true },
      });
    if (!connector) setConnector(nextConnector);
    let selectedWallet: NearWalletBase | null = null;
    let selectedAccount = "";
    try {
      const connected = await nextConnector.getConnectedWallet();
      selectedWallet = connected.wallet;
      selectedAccount = connected.accounts[0]?.accountId ?? "";
    } catch {
      // Not connected yet.
    }
    if (!selectedWallet || !selectedAccount) {
      selectedWallet = await nextConnector.connect();
      const accounts = await selectedWallet.getAccounts();
      selectedAccount = accounts[0]?.accountId ?? "";
    }
    if (!selectedWallet || !selectedAccount) throw new Error("No NEAR wallet account was selected");
    setWallet(selectedWallet);
    setAccountId(selectedAccount);
    return { wallet: selectedWallet, accountId: selectedAccount };
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

  async function send(
    label: string,
    receiverId: string,
    methodName: string,
    args: Record<string, unknown>,
    gas: string,
    deposit = "0",
  ) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const { wallet: signer, accountId: signerAccount } = await ensureWallet();
      const outcome = await signer.signAndSendTransaction({
        receiverId,
        signerId: signerAccount,
        network: props.network,
        actions: [
          {
            type: "FunctionCall",
            params: { methodName, args, gas, deposit },
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

  async function createBountyDone() {
    if (!props.nativeBounty || !props.recipient) return;
    await send(
      "BountyDone proposal",
      props.daoAccount,
      "add_proposal",
      {
        proposal: {
          description: `BountyBoard S0 completion for issue ${props.issueId}`,
          kind: {
            BountyDone: {
              bounty_id: props.nativeBounty.id,
              receiver_id: props.recipient,
            },
          },
        },
      },
      GAS.async,
      props.proposalBondNear ? nearToYocto(props.proposalBondNear) : "0",
    );
  }

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
        {accountId ? <span className="font-mono">{shortenAccount(accountId, 12, 8)}</span> : null}
        {accountId ? (
          isCouncil ? <Badge tone="accent">Council</Badge> : <Badge>{maintainer ? "Maintainer" : "Viewer"}</Badge>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy !== null}
            className="ml-auto rounded-full border border-line px-3 py-1.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === "connect" ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">AddBounty proposal</p>
          <p className="mt-1 font-semibold">
            {props.addBountyProposal
              ? `#${props.addBountyProposal.id} · ${props.addBountyProposal.status}`
              : props.s0?.proposal_id
                ? `#${props.s0.proposal_id} · loading`
                : "Not created"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Native bounty</p>
          <p className="mt-1 font-semibold">
            {props.nativeBounty ? `#${props.nativeBounty.id}` : registered ? `#${props.s0?.native_bounty_id}` : "Not found"}
          </p>
          {props.nativeBounty ? (
            <p className="mt-1 text-muted">{formatNear(props.nativeBounty.amount)} NEAR · {props.nativeBounty.status}</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">BountyDone proposal</p>
          <p className="mt-1 font-semibold">
            {doneProposal
              ? `#${doneProposal.id} · ${doneProposal.status}`
              : props.s0?.bounty_done_proposal_id
                ? `#${props.s0.bounty_done_proposal_id} · loading`
                : "Not created"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {addBountyPending ? (
          <button
            type="button"
            onClick={() =>
              void send(
                "AddBounty vote",
                props.daoAccount,
                "act_proposal",
                {
                  id: props.addBountyProposal?.id,
                  action: "VoteApprove",
                  memo: `BountyBoard S0 AddBounty issue ${props.issueId}`,
                },
                GAS.async,
              )
            }
            disabled={busy !== null || !isCouncil}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy === "AddBounty vote" ? "Voting…" : "Vote AddBounty proposal"}
          </button>
        ) : null}
        {canRegister ? (
          <button
            type="button"
            onClick={() =>
              void send(
                "Native bounty registration",
                props.boardAccount,
                "register_s0_bounty",
                { issue_id: props.issueId, bounty_id: props.nativeBounty?.id },
                GAS.simple,
              )
            }
            disabled={busy !== null}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy === "Native bounty registration"
              ? "Registering…"
              : `Register native bounty #${props.nativeBounty?.id}`}
          </button>
        ) : null}
        {canCreateDone ? (
          <button
            type="button"
            onClick={() => void createBountyDone()}
            disabled={busy !== null}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy === "BountyDone proposal" ? "Proposing…" : "Create BountyDone proposal"}
          </button>
        ) : null}
        {canRecordDone && doneProposal?.status === "InProgress" ? (
          <button
            type="button"
            onClick={() =>
              void send(
                "BountyDone vote",
                props.daoAccount,
                "act_proposal",
                {
                  id: doneProposal.id,
                  action: "VoteApprove",
                  memo: `BountyBoard S0 completion for issue ${props.issueId}`,
                },
                GAS.async,
              )
            }
            disabled={busy !== null || !isCouncil}
            className="rounded-full border border-line px-4 py-2 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === "BountyDone vote" ? "Voting…" : "Vote BountyDone proposal"}
          </button>
        ) : null}
        {canRecordDone ? (
          <button
            type="button"
            onClick={() =>
              void send(
                "Record BountyDone",
                props.boardAccount,
                "approve_bounty_done",
                { issue_id: props.issueId, proposal_id: doneProposal?.id },
                GAS.async,
              )
            }
            disabled={busy !== null || !doneProposal}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy === "Record BountyDone" ? "Recording…" : "Record BountyDone"}
          </button>
        ) : null}
        {canConfirm ? (
          <button
            type="button"
            onClick={() =>
              void send(
                "Confirm S0 payout",
                props.boardAccount,
                "confirm_payout",
                { issue_id: props.issueId },
                GAS.async,
              )
            }
            disabled={busy !== null}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy === "Confirm S0 payout" ? "Confirming…" : "Confirm S0 payout"}
          </button>
        ) : null}
      </div>

      {!registered && addBountyApproved && !props.nativeBounty ? (
        <p className="text-muted">
          The AddBounty proposal is approved. Refresh after the DAO creates the native bounty, then
          register it here.
        </p>
      ) : null}
      {!canRecordDone && doneProposal?.status === "InProgress" ? (
        <p className="text-muted">
          The BountyDone proposal is in progress. Record it with the board to trigger the DAO
          auto-vote, or vote it as a council member and refresh.
        </p>
      ) : null}
      {canConfirm ? (
        <p className="text-muted">
          The BountyDone proposal is approved. Confirm the native payout to record the final payout.
        </p>
      ) : null}
    </div>
  );
}
