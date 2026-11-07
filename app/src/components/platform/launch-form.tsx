"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { ErrorPanel, PageHeader, SectionCard } from "@/components/ui";
import { formatNear, nearToYocto, shortenHash } from "@/lib/format";

interface LaunchResponse {
  repository: { slug: string; fullName: string };
  deployment: { id: string; status: string };
}

interface PreflightResponse {
  identity?: { nearAccount: string } | null;
  account?: string | null;
  accountExists?: boolean;
  network?: string;
  funding?: {
    near: string;
    yocto: string;
    budgetYocto: string;
    daoStorageYocto: string;
    boardStorageYocto: string;
    payoutBondReserveYocto: string;
    oracleFundingYocto: string;
    bondsYocto: string;
    bufferYocto: string;
    deployer: string;
    boardWasmBytes: number;
    sputnikWasmBytes: number;
  };
  error?: string;
}

function transactionHash(value: unknown): string {
  const outcome = value as { transaction?: { hash?: unknown } } | null;
  return typeof outcome?.transaction?.hash === "string" ? outcome.transaction.hash : "";
}

const inputClass =
  "w-full rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none transition focus:border-accent";

export function LaunchForm() {
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const [walletAccount, setWalletAccount] = useState("");
  const [fundingTxHash, setFundingTxHash] = useState<string | null>(null);
  const [form, setForm] = useState({
    githubRepo: "",
    slug: "",
    description: "",
    budgetNear: "2",
    dailyCapNear: "1",
  });
  const [repositories, setRepositories] = useState<Array<{ id: number; fullName: string; defaultBranch: string }>>([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(true);
  const [repositoriesError, setRepositoriesError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LaunchResponse | null>(null);

  let budgetYocto = 0n;
  try {
    budgetYocto = BigInt(nearToYocto(form.budgetNear));
  } catch {
    budgetYocto = 0n;
  }
  const requiredYocto =
    (preflight?.funding ? BigInt(preflight.funding.yocto) : 0n) + budgetYocto;
  const requiredNear = formatNear(requiredYocto.toString(), 5);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/platform/github/repos", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { repositories?: Array<{ id: number; fullName: string; defaultBranch: string }>; error?: string }
          | null;
        if (!response.ok) throw new Error(body?.error ?? "Could not load GitHub repositories");
        if (active) setRepositories(body?.repositories ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setRepositoriesError(
            loadError instanceof Error ? loadError.message : "Could not load GitHub repositories",
          );
        }
      })
      .finally(() => {
        if (active) setRepositoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/launch/preflight", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as PreflightResponse | null;
        if (!response.ok) throw new Error(body?.error ?? "Could not check the linked NEAR account");
        if (active) setPreflight(body);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setPreflightError(
            loadError instanceof Error ? loadError.message : "Could not check the linked NEAR account",
          );
        }
      })
      .finally(() => {
        if (active) setPreflightLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function ensureWallet(): Promise<{ wallet: NearWalletBase; accountId: string }> {
    if (walletRef.current && walletAccount) {
      return { wallet: walletRef.current, accountId: walletAccount };
    }
    const { NearConnector: Connector } = await import("@hot-labs/near-connect");
    if (!connectorRef.current) {
      connectorRef.current = new Connector({
        network: preflight?.network === "mainnet" ? "mainnet" : "testnet",
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
    setWalletAccount(selectedAccount);
    return { wallet, accountId: selectedAccount };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let txHash = fundingTxHash;
      if (!txHash) {
        if (!preflight?.identity || !preflight.funding) {
          throw new Error("Launch funding requirements are not available");
        }
        if (requiredYocto <= 0n) throw new Error("Enter a valid initial DAO budget");
        const { wallet, accountId: signerAccount } = await ensureWallet();
        if (signerAccount !== preflight.identity.nearAccount) {
          throw new Error(
            `Connect the founder account ${preflight.identity.nearAccount} in your wallet before funding`,
          );
        }
        const outcome = await wallet.signAndSendTransaction({
          receiverId: preflight.funding.deployer,
          signerId: signerAccount,
          network: preflight.network === "mainnet" ? "mainnet" : "testnet",
          actions: [
            {
              type: "Transfer",
              params: { deposit: requiredYocto.toString() },
            },
          ],
        });
        txHash = transactionHash(outcome);
        if (!txHash) throw new Error("Could not read the funding transaction hash");
        setFundingTxHash(txHash);
      }

      const response = await fetch("/api/platform/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          githubRepo: form.githubRepo,
          slug: form.slug || undefined,
          description: form.description || undefined,
          budgetNear: Number(form.budgetNear),
          dailyCapNear: Number(form.dailyCapNear),
          fundingTxHash: txHash,
        }),
      });
      const body = (await response.json().catch(() => null)) as LaunchResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(body && "error" in body ? body.error ?? "Launch failed" : "Launch failed");
      }
      setResult(body as LaunchResponse);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Launch failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-7">
        <PageHeader eyebrow="Launch complete" title="Your board is live" description={`${result.repository.fullName} was deployed on ${result.deployment.status}.`} />
        <SectionCard title="Next steps">
          <div className="space-y-3 text-sm">
            <p>
              Board:{" "}
              <Link href={`/r/${result.repository.slug}`} className="text-accent hover:underline">
                /r/{result.repository.slug}
              </Link>
            </p>
            <p className="text-xs text-muted">
              Deployment {result.deployment.id} is {result.deployment.status}. Fund the board, invite maintainers, and create your first bounty through the DAO.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href={`/r/${result.repository.slug}`} className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-white">
                Open repository
              </Link>
              <Link href="/" className="rounded-full border border-line px-4 py-2 text-xs font-semibold">
                Directory
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-7">
      <PageHeader
        eyebrow="Launch"
        title="Launch a bounty board"
        description="Verify admin access to a public repository, then deploy a DAO, BountyBoard contract, and scoped oracle. Council control goes to the NEAR account linked to your GitHub identity."
      >
      </PageHeader>
      <div className="space-y-2">
        {preflightLoading ? (
          <div className="rounded-2xl border border-line bg-panel p-4 text-xs text-muted">
            Checking your linked NEAR account…
          </div>
        ) : preflightError ? (
          <ErrorPanel>{preflightError}</ErrorPanel>
        ) : !preflight?.identity ? (
          <ErrorPanel>
            No NEAR account is linked.{" "}
            <Link href="/account#identity" className="font-semibold underline">
              Link one first
            </Link>
            .
          </ErrorPanel>
        ) : !preflight.accountExists ? (
          <ErrorPanel>
            Linked account <span className="font-mono">{preflight.identity.nearAccount}</span> does
            not exist on {preflight.network}.{" "}
            <Link href="/account#identity" className="font-semibold underline">
              Update your identity link
            </Link>
            .
          </ErrorPanel>
        ) : (
          <div className="rounded-2xl border border-line bg-panel p-4 text-xs text-muted">
            <p>
              Founder account:{" "}
              <span className="font-mono text-foreground">{preflight.identity.nearAccount}</span>{" "}
              (verified on {preflight.network})
            </p>
            {preflight.funding ? (
              <p className="mt-1">
                Founder funds{" "}
                <span className="font-semibold text-foreground">{requiredNear} NEAR</span> to the
                deployer{" "}
                <span className="font-mono text-foreground">{preflight.funding.deployer}</span> for
                this launch.
              </p>
            ) : null}
          </div>
        )}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <SectionCard title="Repository">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium">GitHub repository</span>
              <select
                required
                value={form.githubRepo}
                onChange={(event) => update("githubRepo", event.target.value)}
                disabled={repositoriesLoading || Boolean(repositoriesError)}
                className={inputClass}
              >
                <option value="">
                  {repositoriesLoading ? "Loading repositories…" : "Select a public repository…"}
                </option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.fullName}>
                    {repository.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium">Board slug</span>
              <input value={form.slug} onChange={(event) => update("slug", event.target.value)} placeholder="auto from repo name" className={inputClass} />
            </label>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="font-medium">Description</span>
              <textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={2} className={inputClass} />
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted">
            Only public repositories where you have admin access are shown. The founder and initial
            council are the NEAR account linked to your GitHub identity.{" "}
            <Link href="/account#identity" className="text-accent hover:underline">
              Manage identity
            </Link>
            .
          </p>
        </SectionCard>
        <SectionCard title="Budget">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium">Initial DAO budget (NEAR)</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.budgetNear}
                onChange={(event) => {
                  update("budgetNear", event.target.value);
                  setFundingTxHash(null);
                }}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium">Daily cap (NEAR)</span>
              <input required type="number" min="0.01" step="0.01" value={form.dailyCapNear} onChange={(event) => update("dailyCapNear", event.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted">
            The founder pays {requiredNear} NEAR to the deployer. The initial DAO budget is deposited
            into the DAO and set as the board budget. The rest covers DAO/board/oracle storage,
            proposal bonds, a payout bond reserve, and a fee buffer. GitHub access is read from your signed-in session.
          </p>
          {fundingTxHash ? (
            <p className="mt-2 font-mono text-[11px] text-muted">
              Funding tx: {shortenHash(fundingTxHash, 10, 8)}
            </p>
          ) : null}
        </SectionCard>
        {preflight?.funding ? (
          <SectionCard title="Launch funding" description="Calculated from the current wasm sizes and DAO settings.">
            <div className="space-y-1 text-xs">
              {[
                ["DAO wasm storage", preflight.funding.daoStorageYocto],
                ["Initial DAO budget", budgetYocto.toString()],
                ["Board wasm storage", preflight.funding.boardStorageYocto],
                ["Payout bond reserve", preflight.funding.payoutBondReserveYocto],
                ["Oracle account", preflight.funding.oracleFundingYocto],
                ["Proposal bonds", preflight.funding.bondsYocto],
                ["Fee/storage buffer", preflight.funding.bufferYocto],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-line py-1.5 last:border-b-0">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono text-foreground">{formatNear(value, 5)} NEAR</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 pt-2 text-sm font-semibold">
                <span>Total founder funding</span>
                <span className="font-mono">{requiredNear} NEAR</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted">
              DAO storage wasm: {preflight.funding.sputnikWasmBytes.toLocaleString()} bytes. Board
              storage wasm: {preflight.funding.boardWasmBytes.toLocaleString()} bytes. Proposal bonds
              are temporary; the buffer covers transaction fees and storage variance.
            </p>
          </SectionCard>
        ) : null}
        {repositoriesError ? <ErrorPanel>{repositoriesError}</ErrorPanel> : null}
        {!repositoriesLoading && !repositoriesError && repositories.length === 0 ? (
          <p className="text-xs leading-5 text-muted">
            No public repositories with admin access were found. Sign out and sign in again if you
            recently granted repository access.
          </p>
        ) : null}
        {error ? <ErrorPanel>{error}</ErrorPanel> : null}
        <button
          type="submit"
          disabled={
            submitting ||
            preflightLoading ||
            Boolean(preflightError) ||
            !preflight?.identity ||
            !preflight.accountExists ||
            repositoriesLoading ||
            Boolean(repositoriesError) ||
            repositories.length === 0 ||
            !form.githubRepo ||
            budgetYocto <= 0n
          }
          className="rounded-full bg-foreground px-5 py-2.5 text-xs font-semibold text-white transition disabled:opacity-50"
        >
          {submitting
            ? "Launching…"
            : fundingTxHash
              ? "Verify and launch"
              : preflight?.funding
                ? `Fund ${requiredNear} NEAR and launch`
                : "Fund and launch"}
        </button>
      </form>
    </div>
  );
}
