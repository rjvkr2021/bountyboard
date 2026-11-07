import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IdentityLinkPanel } from "@/components/platform/identity-link-panel";
import { Badge, EmptyPanel, PageHeader, SectionCard, Stat } from "@/components/ui";
import { formatNear } from "@/lib/format";
import { auth } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/platform/config";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Your account | BountyBoard",
};

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=/account");
  const { user } = session;

  const store = await getPlatformStore();
  const config = getPlatformConfig();
  const network = config.network === "mainnet" ? "mainnet" : "testnet";
  const summaries = store
    .listRepositoriesByOwner(user.id)
    .filter((repository) => !repository.isPrivate && store.getDeploymentByRepositoryId(repository.id))
    .map((repository) => store.summary(repository));
  const live = summaries.filter((summary) => summary.deployment?.status === "active");
  const totalIssues = summaries.reduce((sum, summary) => sum + summary.issueCount, 0);
  const totalPaid = summaries.reduce((sum, summary) => sum + BigInt(summary.totalPaid), 0n);

  let nearAccount: string | null = null;
  try {
    const accounts = await auth.api.listUserAccounts({ headers: await headers() });
    const github = accounts.find((account) => account.providerId === "github");
    const githubUserId = github ? Number(github.accountId) : NaN;
    nearAccount = Number.isSafeInteger(githubUserId)
      ? (store.getIdentityByUserId(githubUserId)?.nearAccount ?? null)
      : null;
  } catch {
    nearAccount = null;
  }
  const earnedIssues = nearAccount
    ? store
        .listBoards()
        .flatMap((board) => store.listIssues(board.boardAccount))
        .filter(
          (issue) =>
            issue.status === "Paid" &&
            (issue.mergeProof?.pr_author_account === nearAccount ||
              (!issue.mergeProof && issue.claimants.includes(nearAccount))),
        )
    : [];
  const totalEarned = earnedIssues.reduce((sum, issue) => sum + BigInt(issue.amount), 0n);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Account"
        title={user.name}
        description={`${user.email} · Member since ${new Date(user.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
      >
        <Link
          href="/launch"
          className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Launch a board
        </Link>
        <SignOutButton />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Repositories" value={String(summaries.length)} hint={`${live.length} live boards`} />
        <Stat label="Bounties" value={String(totalIssues)} hint="Across your boards" />
        <Stat label="Paid" value={`${formatNear(totalPaid.toString())} NEAR`} hint="Your boards" />
        <Stat
          label="Earned"
          value={`${formatNear(totalEarned.toString())} NEAR`}
          hint={`${earnedIssues.length} paid bount${earnedIssues.length === 1 ? "y" : "ies"}`}
        />
        <Stat
          label="Signed in"
          value={new Date(session.session.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
          hint="Current session"
        />
      </div>

      <SectionCard
        title="Your repositories"
        description="Repositories with boards you launched."
        action={
          <Link href="/launch" className="text-xs font-semibold text-accent hover:underline">
            Launch a board
          </Link>
        }
      >
        {summaries.length === 0 ? (
          <EmptyPanel>
            You have not launched a board yet.{" "}
            <Link href="/launch" className="text-accent hover:underline">
              Launch your first board
            </Link>
            .
          </EmptyPanel>
        ) : (
          <div className="space-y-2">
            {summaries.map(({ repository, deployment, issueCount, totalPaid }) => (
              <Link
                key={repository.id}
                href={`/r/${repository.slug}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-background px-4 py-3 transition hover:border-accent"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{repository.fullName}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {issueCount} bounties · {formatNear(totalPaid)} NEAR paid
                  </p>
                </div>
                <span className="ml-auto flex flex-wrap gap-1">
                  <Badge tone={deployment?.status === "active" ? "accent" : "warn"}>
                    {deployment?.status ?? "pending"}
                  </Badge>
                </span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        id="identity"
        title="Identity"
        description="Link the GitHub account you sign in with to the NEAR account that receives payouts and reputation."
      >
        <IdentityLinkPanel network={network} />
      </SectionCard>

      <SectionCard title="Next steps" description="Publish more of your work.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/launch" className="rounded-xl border border-line bg-background p-4 transition hover:border-accent">
            <p className="text-sm font-semibold">Launch another board</p>
            <p className="mt-1 text-xs leading-5 text-muted">Deploy a DAO, board contract, and oracle for another public repository you administer.</p>
          </Link>
          <a href="#identity" className="rounded-xl border border-line bg-background p-4 transition hover:border-accent">
            <p className="text-sm font-semibold">Manage identity</p>
            <p className="mt-1 text-xs leading-5 text-muted">Connect or update the payout account linked to your GitHub identity.</p>
          </a>
        </div>
      </SectionCard>
    </div>
  );
}
