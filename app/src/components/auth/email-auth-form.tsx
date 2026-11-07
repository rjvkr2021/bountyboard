"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorPanel } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}

export function EmailAuthForm({
  mode,
  nextPath,
}: {
  mode: "signin" | "signup";
  nextPath?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const destination = safeNext(nextPath);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name })
          : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "Authentication failed");
      router.push(destination);
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}
      {mode === "signup" ? (
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Name
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
          />
        </label>
      ) : null}
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
        />
      </label>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-foreground px-5 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? mode === "signup"
            ? "Creating account…"
            : "Signing in…"
          : mode === "signup"
            ? "Create account"
            : "Sign in with email"}
      </button>
    </form>
  );
}
