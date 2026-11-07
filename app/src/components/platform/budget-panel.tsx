"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { Badge, ErrorPanel } from "@/components/ui";
import { formatNear, nearToYocto, shortenAccount, shortenHash } from "@/lib/format";
import type { DaoProposalView } from "@/lib/platform/dao-reader";
import type { MaintainerSnapshot } from "@/lib/platform/types";

interface BudgetPanelProps {
  slug: string;
  boardAccount: string;
  daoAccount: string;
  network: "testnet" | "mainnet";
  maintainers: Record<string, MaintainerSnapshot>;
  budget: string;
  committed: string;
  availableAmount: string;
  proposal: DaoProposalView | null;
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

export function BudgetPanel(props: BudgetPanelProps) {
  const router = useRouter();
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState("");
  const [newBudgetNear, setNewBudgetNear] = useState(formatNear(props.budget));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const maintainer = accountId ? props.maintainers[accountId] : null;
  const isCouncil = Boolean(maintainer?.council_derived);

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
    setBusy(true);
    setError(null);
    try {
      await ensureWallet();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect wallet");
    } finally {
      setBusy(false);
    }
  }

  async function send(label: string, receiverId: string, methodName: string, args: Record<string, unknown>, deposit = "0") {
    setBusy(true);
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
            params: { methodName, args, gas: GAS.async, deposit },
          },
        ],
      });
      const hash = transactionHash(outcome);
      setNotice(`${label} submitted${hash ? ` (${shortenHash(hash, 10, 8)})` : ""}. Syncing chain state.`);
      await syncBoard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function proposeBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const amount = BigInt(nearToYocto(newBudgetNear));
    if (amount < BigInt(props.committed)) {
      setError("Budget cannot be below the committed amount");
      return;
    }
    const args = btoa(JSON.stringify({ repo_id: 0, amount: amount.toString() }));
    await send(
      "Budget proposal",
      props.daoAccount,
      "add_proposal",
      {
        proposal: {
          description: `BountyBoard budget update to ${newBudgetNear} NEAR`,
          kind: {
            FunctionCall: {
              receiver_id: props.boardAccount,
              actions: [
                {
                  method_name: "set_budget",
                  args,
                  deposit: "0",
                  gas: GAS.async,
                },
              ],
            },
          },
        },
      },
      nearToYocto(props.proposalBondNear),
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

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Board budget</p>
          <p className="mt-1 font-semibold">{formatNear(props.budget)} NEAR</p>
          <p className="mt-1 text-muted">{formatNear(props.committed)} committed</p>
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">DAO available</p>
          <p className="mt-1 font-semibold">{formatNear(props.availableAmount)} NEAR</p>
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Budget proposal</p>
          <p className="mt-1 font-semibold">
            {props.proposal ? `#${props.proposal.id} · ${props.proposal.status}` : "None active"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2">
        <Badge tone={accountId ? "accent" : "neutral"}>
          {accountId ? "Wallet connected" : "Wallet not connected"}
        </Badge>
        {accountId ? <span className="font-mono">{shortenAccount(accountId, 12, 8)}</span> : null}
        {accountId ? (
          isCouncil ? <Badge tone="accent">Council</Badge> : <Badge tone="warn">Council required</Badge>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="ml-auto rounded-full border border-line px-3 py-1.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>

      {props.proposal?.status === "InProgress" ? (
        <button
          type="button"
          onClick={() =>
            void send("Budget vote", props.daoAccount, "act_proposal", {
              id: props.proposal?.id,
              action: "VoteApprove",
              memo: `BountyBoard budget proposal ${props.proposal?.id}`,
            })
          }
          disabled={busy || !isCouncil}
          className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Voting…" : "Vote budget proposal"}
        </button>
      ) : null}

      <form onSubmit={proposeBudget} className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          New total budget (NEAR)
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={newBudgetNear}
            onChange={(event) => setNewBudgetNear(event.target.value)}
            className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !isCouncil}
          className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Propose budget"}
        </button>
      </form>
      <p className="text-muted">
        The council signs a DAO proposal that calls <code className="font-mono">set_budget</code>.
        The board budget is an accounting cap; the DAO must hold enough funds to settle payouts.
      </p>
    </div>
  );
}
