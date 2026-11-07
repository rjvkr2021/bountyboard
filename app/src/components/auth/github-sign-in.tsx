"use client";

import { useState } from "react";
import { ErrorPanel } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

export function GitHubSignIn({
  configured,
  nextPath,
}: {
  configured: boolean;
  nextPath?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const destination = safeNext(nextPath);

  async function signIn() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: destination,
      });
      if (result.error) {
        throw new Error(result.error.message || "GitHub sign-in failed");
      }
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "GitHub sign-in failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <ErrorPanel>
          GitHub sign-in is not configured. Set <code>GITHUB_CLIENT_ID</code> and{" "}
          <code>GITHUB_CLIENT_SECRET</code>, then restart the app.
        </ErrorPanel>
      ) : null}

      {error ? <ErrorPanel>{error}</ErrorPanel> : null}

      <button
        type="button"
        onClick={signIn}
        disabled={!configured || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GitHubMark />
        {submitting ? "Redirecting to GitHub…" : "Continue with GitHub"}
      </button>

      <p className="text-center text-[11px] leading-5 text-muted">
        GitHub is required to claim and verify bounty work. We use your GitHub profile and verified
        email to create or connect your session.
      </p>
    </div>
  );
}
