"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, ErrorPanel } from "@/components/ui";
import { shortenHash } from "@/lib/format";
import type { SecurityDisclosureSnapshot } from "@/lib/platform/types";

interface PrivateSecurityActionsProps {
  slug: string;
  issueId: number;
  status: string;
  security: SecurityDisclosureSnapshot | null;
  canDisclose: boolean;
  researcherAccount: string | null;
}

export function PrivateSecurityActions(props: PrivateSecurityActionsProps) {
  const router = useRouter();
  const [ghsaId, setGhsaId] = useState("");
  const [advisoryUrl, setAdvisoryUrl] = useState("");
  const [researcherGithub, setResearcherGithub] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function disclose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/platform/repos/${encodeURIComponent(props.slug)}/issues/${props.issueId}/disclose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ghsaId, advisoryUrl, researcherGithub }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { txHash?: string; error?: string }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not disclose the advisory");
      setNotice(`Advisory disclosed${body?.txHash ? ` (${shortenHash(body.txHash, 10, 8)})` : ""}. Refreshing.`);
      await fetch("/api/platform/indexer/tick", { method: "POST" }).catch(() => null);
      router.refresh();
    } catch (discloseError) {
      setError(discloseError instanceof Error ? discloseError.message : "Could not disclose the advisory");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-xs leading-5">
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          {notice}
        </div>
      ) : null}

      {props.security ? (
        <div className="space-y-2 rounded-xl border border-line bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Disclosed</Badge>
            <span className="font-mono">{props.security.ghsa_id}</span>
          </div>
          <p className="text-muted">
            Researcher: <span className="font-mono text-foreground">{props.security.researcher_github}</span>
            {props.researcherAccount ? (
              <> → <span className="font-mono text-foreground">{props.researcherAccount}</span></>
            ) : (
              " · no linked NEAR account yet"
            )}
          </p>
          <a
            href={props.security.advisory_url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-accent hover:underline"
          >
            {props.security.advisory_url}
          </a>
        </div>
      ) : null}

      {!props.security && props.status === "Approved" && props.canDisclose ? (
        <form onSubmit={disclose} className="space-y-3 rounded-xl border border-line bg-background p-3">
          <p className="font-semibold text-foreground">Disclose the fixed advisory</p>
          <p className="text-muted">
            The board oracle records the disclosure. Only a linked board maintainer can submit this
            form.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              GHSA ID
              <input
                required
                value={ghsaId}
                onChange={(event) => setGhsaId(event.target.value)}
                placeholder="GHSA-AAAA-BBBB-CCCC"
                className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
              />
            </label>
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Researcher GitHub
              <input
                required
                value={researcherGithub}
                onChange={(event) => setResearcherGithub(event.target.value)}
                placeholder="researcher"
                className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
              />
            </label>
          </div>
          <label className="block space-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Advisory URL
            <input
              required
              type="url"
              value={advisoryUrl}
              onChange={(event) => setAdvisoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/security/advisories/GHSA-..."
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-foreground px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Disclosing…" : "Disclose advisory"}
          </button>
        </form>
      ) : null}

      {!props.security && props.status !== "Approved" ? (
        <p className="text-muted">
          Disclosure unlocks after the bounty is approved. Current status: {props.status}.
        </p>
      ) : null}
      {!props.security && props.status === "Approved" && !props.canDisclose ? (
        <p className="text-muted">
          Only a board maintainer with a linked GitHub↔NEAR identity can disclose this advisory.
        </p>
      ) : null}
    </div>
  );
}
