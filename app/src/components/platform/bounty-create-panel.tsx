"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { Badge, ErrorPanel } from "@/components/ui";
import { formatNear, nearToYocto, shortenAccount, shortenHash } from "@/lib/format";
import type { MaintainerSnapshot } from "@/lib/platform/types";

interface BountyCreatePanelProps {
  slug: string;
  boardAccount: string;
  network: "testnet" | "mainnet";
  maintainers: Record<string, MaintainerSnapshot>;
  budget: string;
  committed: string;
}

const GAS = {
  create: "100000000000000",
};

function transactionHash(value: unknown): string {
  const outcome = value as { transaction?: { hash?: unknown } } | null;
  return typeof outcome?.transaction?.hash === "string" ? outcome.transaction.hash : "";
}

export function BountyCreatePanel(props: BountyCreatePanelProps) {
  const router = useRouter();
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState("");
  const [issueNumber, setIssueNumber] = useState("");
  const [tier, setTier] = useState("S2");
  const [amountNear, setAmountNear] = useState("0.1");
  const [contributor, setContributor] = useState("");
  const [privateGhsa, setPrivateGhsa] = useState("");
  const [privateTier, setPrivateTier] = useState("S2");
  const [privateAmountNear, setPrivateAmountNear] = useState("0.1");
  const [busy, setBusy] = useState(false);
  const [privateBusy, setPrivateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isMaintainer = Boolean(accountId && props.maintainers[accountId]);
  const available = BigInt(props.budget) - BigInt(props.committed);

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

  async function syncBoard() {
    await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
    router.refresh();
  }

  async function createBounty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const number = Number(issueNumber);
      if (!Number.isInteger(number) || number <= 0) throw new Error("Enter a valid GitHub issue number");
      const amount = BigInt(nearToYocto(amountNear));
      if (amount <= 0n) throw new Error("Enter a positive bounty amount");
      if (amount > available) throw new Error("Bounty exceeds the board's available budget");
      const issueResponse = await fetch(
        `/api/platform/repos/${encodeURIComponent(props.slug)}/github-issue?number=${number}`,
      );
      const issue = (await issueResponse.json().catch(() => null)) as
        | { issue?: { title: string }; error?: string }
        | null;
      if (!issueResponse.ok) throw new Error(issue?.error ?? "Could not verify the GitHub issue");
      const { wallet: signer, accountId: signerAccount } = await ensureWallet();
      const outcome = await signer.signAndSendTransaction({
        receiverId: props.boardAccount,
        signerId: signerAccount,
        network: props.network,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "create_bounty",
              args: {
                issue_number: number,
                tier,
                amount: amount.toString(),
                contributor: contributor.trim() || null,
              },
              gas: GAS.create,
              deposit: "0",
            },
          },
        ],
      });
      const hash = transactionHash(outcome);
      setNotice(
        tier === "S0"
          ? `S0 bounty created${hash ? ` (${shortenHash(hash, 10, 8)})` : ""}. Vote on the DAO AddBounty proposal next.`
          : `Bounty created${hash ? ` (${shortenHash(hash, 10, 8)})` : ""}. Syncing board state.`,
      );
      setIssueNumber("");
      setContributor("");
      await syncBoard();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create bounty");
    } finally {
      setBusy(false);
    }
  }

  async function createPrivateBounty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPrivateBusy(true);
    setError(null);
    setNotice(null);
    try {
      const normalized = privateGhsa.trim().toUpperCase();
      if (!/^GHSA(-[A-Z0-9]{4}){3}$/.test(normalized)) {
        throw new Error("Enter a valid GHSA ID, for example GHSA-AAAA-BBBB-CCCC");
      }
      const amount = BigInt(nearToYocto(privateAmountNear));
      if (amount <= 0n) throw new Error("Enter a positive bounty amount");
      if (amount > available) throw new Error("Bounty exceeds the board's available budget");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
      );
      const privateRef = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const { wallet: signer, accountId: signerAccount } = await ensureWallet();
      const outcome = await signer.signAndSendTransaction({
        receiverId: props.boardAccount,
        signerId: signerAccount,
        network: props.network,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "create_private_security_bounty",
              args: {
                private_ref: privateRef,
                tier: privateTier,
                amount: amount.toString(),
              },
              gas: GAS.create,
              deposit: "0",
            },
          },
        ],
      });
      const hash = transactionHash(outcome);
      setNotice(
        `Private security bounty created${hash ? ` (${shortenHash(hash, 10, 8)})` : ""}. It is visible only to maintainers until disclosure.`,
      );
      setPrivateGhsa("");
      await syncBoard();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create private bounty");
    } finally {
      setPrivateBusy(false);
    }
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
          isMaintainer ? <Badge tone="accent">Maintainer</Badge> : <Badge tone="warn">Not a maintainer</Badge>
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

      <p className="text-muted">
        Available budget: <span className="font-mono text-foreground">{formatNear(available.toString())} NEAR</span>{" "}
        of <span className="font-mono">{formatNear(props.budget)} NEAR</span>.
      </p>

      <form onSubmit={createBounty} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            GitHub issue
            <input
              required
              type="number"
              min="1"
              value={issueNumber}
              onChange={(event) => setIssueNumber(event.target.value)}
              placeholder="42"
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Tier
            <select
              value={tier}
              onChange={(event) => setTier(event.target.value)}
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            >
              <option value="S0">S0 — native DAO bounty</option>
              <option value="S1">S1 — two approvals</option>
              <option value="S2">S2 — one approval</option>
              <option value="S3">S3 — one approval / auto</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Amount (NEAR)
            <input
              required
              type="number"
              min="0.000001"
              step="0.000001"
              value={amountNear}
              onChange={(event) => setAmountNear(event.target.value)}
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Intended contributor (optional)
            <input
              type="text"
              value={contributor}
              onChange={(event) => setContributor(event.target.value.trim())}
              placeholder="alice.testnet"
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !isMaintainer}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create bounty"}
          </button>
          {!accountId ? <span className="text-muted">Connect a maintainer wallet to create a bounty.</span> : null}
          {accountId && !isMaintainer ? (
            <span className="text-muted">The connected account is not a board maintainer.</span>
          ) : null}
        </div>
      </form>

      {tier === "S0" ? (
        <p className="text-muted">
          S0 creates a native DAO bounty and an AddBounty proposal. A council member must approve
          the proposal, then register the native bounty before it can be claimed and completed.
        </p>
      ) : null}

      <div className="border-t border-line pt-4">
        <p className="font-semibold text-foreground">Private security bounty</p>
        <p className="mt-1 text-muted">
          Create a hidden security bounty from a GitHub advisory ID. It is visible only to board
          maintainers until the advisory is disclosed. Private S0 is not exposed yet.
        </p>
        <form onSubmit={createPrivateBounty} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1 space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            GHSA ID
            <input
              required
              type="text"
              value={privateGhsa}
              onChange={(event) => setPrivateGhsa(event.target.value)}
              placeholder="GHSA-AAAA-BBBB-CCCC"
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Tier
            <select
              value={privateTier}
              onChange={(event) => setPrivateTier(event.target.value)}
              className="rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            >
              <option value="S1">S1</option>
              <option value="S2">S2</option>
              <option value="S3">S3</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Amount (NEAR)
            <input
              required
              type="number"
              min="0.000001"
              step="0.000001"
              value={privateAmountNear}
              onChange={(event) => setPrivateAmountNear(event.target.value)}
              className="w-32 rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={privateBusy || !isMaintainer}
            className="rounded-full border border-line px-4 py-2 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {privateBusy ? "Creating…" : "Create private bounty"}
          </button>
        </form>
      </div>
    </div>
  );
}
