"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthNav() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const user = session?.user;

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  if (isPending) {
    return <span className="h-8 w-20 animate-pulse rounded-full bg-panel" aria-label="Loading account" />;
  }

  if (!user) {
    return (
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/signin"
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <Link
        href="/account"
        className="max-w-36 truncate rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold transition hover:border-accent hover:text-accent"
        title={user.email}
      >
        {user.name}
      </Link>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="rounded-full px-2 py-1.5 text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
