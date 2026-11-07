"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthNav } from "@/components/auth/auth-nav";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/", label: "Directory" },
  { href: "/launch", label: "Launch", authOnly: true },
  { href: "/docs", label: "Docs" },
  { href: "/status", label: "Status" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const visibleNav = NAV.filter((item) => !item.authOnly || Boolean(session?.user));
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-mono text-sm font-bold text-white">
              B
            </span>
            <span className="text-lg font-semibold tracking-tight">BountyBoard</span>
          </Link>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {visibleNav.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-white"
                      : "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-panel hover:text-foreground"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <AuthNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 sm:px-8">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-5 pb-6 text-[11px] text-muted sm:px-8">
        Multi-repo BountyBoard platform
      </footer>
    </div>
  );
}
