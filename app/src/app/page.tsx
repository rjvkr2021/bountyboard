import Link from "next/link";
import { Badge, EmptyPanel, PageHeader, Stat } from "@/components/ui";
import { formatNear } from "@/lib/format";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DirectoryPage() {
  const store = await getPlatformStore();
  const summaries = store
    .listRepositories()
    .filter((repository) => !repository.isPrivate && store.getDeploymentByRepositoryId(repository.id))
    .map((repository) => store.summary(repository));
  const active = summaries.filter((summary) => summary.deployment?.status === "active");
  const totalBounties = summaries.reduce((sum, summary) => sum + summary.issueCount, 0);
  const totalPaid = summaries.reduce((sum, summary) => sum + BigInt(summary.totalPaid), 0n);
  const contributors = summaries.reduce((sum, summary) => sum + summary.contributorCount, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Public beta"
        title="Verifiable bounty boards for open source"
        description="Launch a DAO-governed bounty board for a public GitHub repository and settle contributor payouts on NEAR."
      >
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Repositories" value={String(summaries.length)} hint={`${active.length} live boards`} />
        <Stat label="Bounties" value={String(totalBounties)} hint="All repositories" />
        <Stat label="Paid out" value={`${formatNear(totalPaid.toString())} NEAR`} hint="Settled on-chain" />
        <Stat label="Contributors" value={String(contributors)} hint="Unique claimants" />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Directory</h2>
            <p className="mt-1 text-xs text-muted">Verified public GitHub repositories with live bounty boards.</p>
          </div>
          <span className="font-mono text-[11px] text-muted">{summaries.length} repos</span>
        </div>
        {summaries.length === 0 ? (
          <EmptyPanel>
            No bounty boards have been launched yet.{" "}
            <Link href="/launch" className="text-accent hover:underline">
              Launch one
            </Link>
            .
          </EmptyPanel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {summaries.map(({ repository, deployment, board, issueCount, openCount, totalPaid, contributorCount }) => (
              <Link
                key={repository.id}
                href={`/r/${repository.slug}`}
                className="group rounded-2xl border border-line bg-panel p-5 transition hover:border-accent"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{repository.owner}</p>
                    <h3 className="mt-0.5 text-base font-semibold group-hover:text-accent">{repository.name}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={deployment?.status === "active" ? "accent" : "warn"}>
                      {deployment?.status ?? "unlaunched"}
                    </Badge>
                    <Badge>{repository.verificationSource.replace("_", " ")}</Badge>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{repository.description}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11px]">
                  <div>
                    <p className="text-muted">Open</p>
                    <p className="font-semibold">{openCount}</p>
                  </div>
                  <div>
                    <p className="text-muted">Bounties</p>
                    <p className="font-semibold">{issueCount}</p>
                  </div>
                  <div>
                    <p className="text-muted">Paid</p>
                    <p className="font-semibold">{formatNear(totalPaid)} NEAR</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                  <span>{contributorCount} contributors</span>
                  <span className="font-mono">{board ? `${formatNear(board.budget)} NEAR budget` : "no board"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
