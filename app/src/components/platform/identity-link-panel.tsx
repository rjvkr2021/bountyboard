"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { Badge, EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import type { IdentityRecord } from "@/lib/platform/types";

interface GithubIdentity {
  userId: number;
  login: string;
}

interface ChallengeResponse {
  token: string;
  message: string;
  nonce: string;
  recipient: string;
  expiresAt: string;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function shortAccount(accountId: string): string {
  if (accountId.length <= 24) return accountId;
  return `${accountId.slice(0, 12)}…${accountId.slice(-8)}`;
}

function clearWalletLocalState(walletId?: string) {
  if (typeof window === "undefined") return;
  const prefix = walletId ? `${walletId}:` : null;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key === "selected-wallet" || (prefix && key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: string) => {
      data.set(key, value);
    },
    remove: async (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

async function fetchIdentityMe(): Promise<{
  github: GithubIdentity | null;
  identity: IdentityRecord | null;
}> {
  const response = await fetch("/api/platform/identity/me", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as {
    github?: GithubIdentity;
    identity?: IdentityRecord | null;
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error ?? "Could not load your identity link");
  return { github: body?.github ?? null, identity: body?.identity ?? null };
}

export function IdentityLinkPanel({ network }: { network: "testnet" | "mainnet" }) {
  const router = useRouter();
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const storageRef = useRef(createMemoryStorage());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);
  const [github, setGithub] = useState<GithubIdentity | null>(null);
  const [linkingGithub, setLinkingGithub] = useState(false);
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return (params.get("error_description") ?? params.get("error"))?.replace(/\+/g, " ") ?? null;
  });
  const [notice, setNotice] = useState<string | null>(null);

  async function loadMe() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIdentityMe();
      setGithub(data.github);
      setIdentity(data.identity);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your identity link");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    clearWalletLocalState();
    let active = true;
    fetchIdentityMe()
      .then((data) => {
        if (!active) return;
        setGithub(data.github);
        setIdentity(data.identity);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load your identity link");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function ensureWallet(): Promise<{ wallet: NearWalletBase; accountId: string }> {
    if (walletRef.current && accountId) {
      return { wallet: walletRef.current, accountId };
    }

    const { NearConnector: Connector } = await import("@hot-labs/near-connect");
    if (!connectorRef.current) {
      connectorRef.current = new Connector({
        network,
        features: { signMessage: true },
        storage: storageRef.current,
        autoConnect: false,
      });
    }
    const connector = connectorRef.current;

    const walletId = await connector.selectWallet();
    clearWalletLocalState(walletId);
    const wallet = await connector.wallet(walletId);
    const accounts = await wallet.signIn({ network });
    const selectedAccount = accounts[0]?.accountId ?? "";

    if (!selectedAccount) {
      throw new Error("No NEAR wallet account was selected");
    }

    walletRef.current = wallet;
    setAccountId(selectedAccount);
    return { wallet, accountId: selectedAccount };
  }

  async function submit(action: "link" | "unlink") {
    setBusy(action);
    setError(null);
    setNotice(null);

    if (action === "unlink") {
      try {
        const response = await fetch("/api/platform/identity", { method: "DELETE" });
        const body = (await response.json().catch(() => null)) as
          | { identity?: IdentityRecord; unlinked?: boolean; error?: string }
          | null;
        if (!response.ok) throw new Error(body?.error ?? "Identity update failed");

        setNotice(
          `Unlinked ${body?.identity?.nearAccount ?? identity?.nearAccount ?? "your NEAR account"}.`,
        );
        await loadMe();
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Identity update failed");
      } finally {
        setBusy(null);
      }
      return;
    }

    let signerWallet: NearWalletBase | null = null;
    try {
      const { wallet, accountId: signerAccount } = await ensureWallet();
      signerWallet = wallet;

      const challengeResponse = await fetch("/api/platform/identity/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, nearAccount: signerAccount }),
      });
      const challenge = (await challengeResponse.json().catch(() => null)) as
        | (ChallengeResponse & { error?: string })
        | null;
      if (!challengeResponse.ok || !challenge) {
        throw new Error(challenge?.error ?? "Could not create the identity challenge");
      }

      const signed = await wallet.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: decodeBase64(challenge.nonce),
        signerId: signerAccount,
      });

      const response = await fetch("/api/platform/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: challenge.token,
          accountId: signed.accountId,
          publicKey: signed.publicKey,
          signature: signed.signature,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { identity?: IdentityRecord; unlinked?: boolean; error?: string }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Identity update failed");

      setNotice(`Linked ${body?.identity?.nearAccount ?? signerAccount}.`);
      await loadMe();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Identity update failed");
    } finally {
      const wallet = signerWallet;
      signerWallet = null;
      if (wallet) {
        await wallet.signOut({ network }).catch(() => undefined);
        clearWalletLocalState(wallet.manifest.id);
      }
      clearWalletLocalState();
      storageRef.current.clear();
      connectorRef.current = null;
      walletRef.current = null;
      setAccountId("");
      setBusy(null);
    }
  }

  if (loading) return <LoadingPanel label="Loading your GitHub link" />;

  async function connectGithub() {
    setError(null);
    setLinkingGithub(true);
    try {
      const result = await authClient.linkSocial({
        provider: "github",
        callbackURL: "/account",
        errorCallbackURL: "/account#identity",
      });
      if (result.error) throw new Error(result.error.message || "GitHub linking failed");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "GitHub linking failed");
      setLinkingGithub(false);
    }
  }

  if (!github) {
    return (
      <div className="space-y-3">
        {error ? <ErrorPanel>{error}</ErrorPanel> : null}
        <EmptyPanel>
          This account is signed in with email. Connect GitHub to claim and verify bounty work.
        </EmptyPanel>
        <button
          type="button"
          onClick={() => void connectGithub()}
          disabled={linkingGithub}
          className="w-full rounded-full bg-foreground px-5 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {linkingGithub ? "Redirecting to GitHub…" : "Connect GitHub"}
        </button>
        <p className="text-center text-[11px] text-muted">
          Or{" "}
          <Link href="/signin?next=/account#identity" className="text-accent hover:underline">
            sign in with a different account
          </Link>
          .
        </p>
      </div>
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
        <Badge tone="accent">GitHub</Badge>
        <span className="font-semibold">{github.login}</span>
        <span className="text-muted">ID {github.userId}</span>
        {identity ? (
          <>
            <span className="text-muted">→</span>
            <span className="font-mono">{identity.nearAccount}</span>
            <Badge>{identity.source}</Badge>
          </>
        ) : (
          <span className="text-muted">No NEAR account linked yet.</span>
        )}
      </div>

      {accountId ? (
        <p className="text-muted">
          Wallet account: <span className="font-mono">{shortAccount(accountId)}</span>
        </p>
      ) : null}

      <p className="text-muted">
        Linking asks your wallet to sign a NEP-413 message. The message includes your GitHub numeric
        ID and the selected NEAR account; no private key leaves the wallet. The wallet connection
        and its local state are cleared after each attempt, so every link starts fresh.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit("link")}
          disabled={busy !== null}
          className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy === "link"
            ? "Waiting for wallet…"
            : identity
              ? "Change NEAR account"
              : "Link NEAR account"}
        </button>
        {identity ? (
          <button
            type="button"
            onClick={() => void submit("unlink")}
            disabled={busy !== null}
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold transition hover:border-red-300 hover:text-red-700 disabled:opacity-50"
          >
            {busy === "unlink" ? "Unlinking…" : "Unlink"}
          </button>
        ) : null}
      </div>

      {identity ? (
        <p className="text-muted">
          Last updated {new Date(identity.updatedAt).toLocaleString()}. You can change or unlink the
          linked account at any time.
        </p>
      ) : null}
    </div>
  );
}
