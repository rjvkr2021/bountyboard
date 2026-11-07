"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IndexerButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function tick() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/platform/indexer/tick", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { boards?: number; changedBoards?: number; changedIssues?: number; errors?: unknown[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Indexer tick failed");
      setMessage(`Scanned ${body?.boards ?? 0} boards, updated ${body?.changedBoards ?? 0} boards and ${body?.changedIssues ?? 0} issues.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Indexer tick failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={tick} disabled={busy} className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? "Indexing…" : "Run indexer tick"}
      </button>
      {message ? <span className="text-[11px] text-muted">{message}</span> : null}
    </div>
  );
}
