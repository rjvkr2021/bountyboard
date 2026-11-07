import Link from "next/link";
import { notFound } from "next/navigation";
import { BountyCreatePanel } from "@/components/platform/bounty-create-panel";
import { BudgetPanel } from "@/components/platform/budget-panel";
import { GovernancePanel } from "@/components/platform/governance-panel";
import { Badge, EmptyPanel, PageHeader, SectionCard, Stat } from "@/components/ui";
import { formatNear, shortenHash } from "@/lib/format";
import { getPlatformConfig } from "@/lib/platform/config";
import { readDaoBudgetState } from "@/lib/platform/dao-reader";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { getViewerContext, isBoardMaintainer, isPrivateSecurityEvent } from "@/lib/platform/viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function issueTone(status: string): "neutral" | "accent" | "warn" | "danger" {
  if (status === "Paid") return "accent";
  if (status === "Escalated" || status === "Refunded") return "danger";
  if (status === "PendingApproval" || status === "MergePending") return "warn";
  return "neutral";
}

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getPlatformStore();
  const repository = store.getRepositoryBySlug(slug);
  if (!repository || repository.isPrivate) notFound();
  const repositoryDeployment = store.getDeploymentByRepositoryId(repository.id);
  if (!repositoryDeployment) notFound();
  const detail = store.detail(repository);
  const { deployment, board, issues, events } = detail;
  const config = getPlatformConfig();
  const budgetState =
    board && deployment
      ? await readDaoBudgetState(config, deployment.daoAccount, deployment.boardAccount)
      : null;
  const viewer = await getViewerContext(store);
  const canViewPrivate = isBoardMaintainer(board, viewer.nearAccount);
  const visibleIssues = canViewPrivate
    ? issues
    : issues.filter((issue) => issue.kind !== "PrivateSecurity");
  const visibleEvents = canViewPrivate
    ? events
    : events.filter((event) => !isPrivateSecurityEvent(event));
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`${repository.owner} / ${repository.name}`}
        title={repository.description || repository.fullName}
        description={`GitHub repository ID ${repository.githubRepoId}. Public repository. Verification: ${repository.verificationSource.replace("_", " ")}.`}
      >
        <Link
          href={`https://github.com/${repository.fullName}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent"
        >
          GitHub
        </Link>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Badge tone={deployment?.status === "active" ? "accent" : "warn"}>
          {deployment?.status ?? "pending"}
        </Badge>
        <Badge>{repository.defaultBranch}</Badge>
        {board ? (
          board.paused ? <Badge tone="danger">paused</Badge> : <Badge tone="accent">active</Badge>
        ) : (
          <Badge tone="warn">pending index</Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Budget" value={board ? `${formatNear(board.budget)} NEAR` : "-"} hint={board ? `${formatNear(board.committed)} committed` : undefined} />
        <Stat label="Daily cap" value={board ? `${formatNear(board.dailyCap)} NEAR` : "-"} hint="Per board" />
        <Stat label="Open bounties" value={String(detail.openCount)} hint={`${detail.issueCount} total`} />
        <Stat label="Paid" value={`${formatNear(detail.totalPaid)} NEAR`} hint={`${detail.contributorCount} contributors`} />
      </div>

      {board && deployment ? (
        <SectionCard
          title="Budget"
          description="The council sets the board budget through a DAO proposal. The launch budget is already funded in the DAO."
        >
          <BudgetPanel
            slug={repository.slug}
            boardAccount={deployment.boardAccount}
            daoAccount={deployment.daoAccount}
            network={deployment.network === "mainnet" ? "mainnet" : "testnet"}
            maintainers={board.maintainers}
            budget={board.budget}
            committed={board.committed}
            availableAmount={budgetState?.availableAmount ?? "0"}
            proposal={budgetState?.budgetProposal ?? null}
            proposalBondNear={config.near.proposalBondNear}
          />
        </SectionCard>
      ) : null}

      {board && deployment ? (
        <SectionCard
          title="Create bounty"
          description="Maintainers create a public bounty for a GitHub issue. S0 uses the native DAO bounty flow."
        >
          <BountyCreatePanel
            slug={repository.slug}
            boardAccount={deployment.boardAccount}
            network={deployment.network === "mainnet" ? "mainnet" : "testnet"}
            maintainers={board.maintainers}
            budget={board.budget}
            committed={board.committed}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Issues"
        description="Bounties tracked by this board. Payouts settle on NEAR after approvals."
        action={<span className="font-mono text-[11px] text-muted">{visibleIssues.length} issues</span>}
      >
        {visibleIssues.length === 0 ? (
          <EmptyPanel>No bounties have been created for this repository yet.</EmptyPanel>
        ) : (
          <div className="space-y-2">
            {visibleIssues.map((issue) => (
              <Link
                key={issue.issueId}
                href={`/r/${repository.slug}/issues/${issue.issueId}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-background px-4 py-3 transition hover:border-accent"
              >
                <span className="font-mono text-xs text-muted">
                  {issue.issueNumber ? `#${issue.issueNumber}` : `issue ${issue.issueId}`}
                </span>
                <Badge tone={issueTone(issue.status)}>{issue.status}</Badge>
                <Badge>{issue.tier}</Badge>
                <span className="text-xs text-muted">{issue.kind}</span>
                <span className="ml-auto font-mono text-xs font-semibold">{formatNear(issue.amount)} NEAR</span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="Maintainers" description="Council-derived and promoted maintainers.">
          <div className="space-y-2">
            {Object.entries(board?.maintainers ?? {}).map(([account, record]) => (
              <div key={account} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-xs">
                <span className="font-mono">{account}</span>
                {record.council_derived ? <Badge>council</Badge> : null}
                {record.promoted ? <Badge tone="accent">promoted</Badge> : null}
                <span className="ml-auto text-muted">{record.bounties_approved} approved</span>
              </div>
            ))}
            {Object.keys(board?.maintainers ?? {}).length === 0 ? <EmptyPanel>No maintainers recorded.</EmptyPanel> : null}
          </div>
        </SectionCard>

        <SectionCard title="Deployment" description="Contracts and launch transactions.">
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">DAO</dt>
              <dd className="font-mono">{deployment?.daoAccount || "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Board</dt>
              <dd className="font-mono">{deployment?.boardAccount || "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Oracle</dt>
              <dd className="font-mono">{deployment?.oracleAccount || "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Cursor</dt>
              <dd className="font-mono">{detail.cursor?.blockHeight ?? "not indexed"}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-1 border-t border-line pt-3">
            {(deployment?.txHashes ?? []).map((hash) => (
              <p key={hash} className="font-mono text-[11px] text-muted" title={hash}>
                {shortenHash(hash, 12, 10)}
              </p>
            ))}
          </div>
        </SectionCard>
      </div>

      {board && deployment ? (
        <SectionCard
          title="Governance"
          description="Maintainer candidates, promotion, and council requests. Wallet transactions are signed by the connected account."
        >
          <GovernancePanel
            slug={repository.slug}
            boardAccount={deployment.boardAccount}
            daoAccount={deployment.daoAccount}
            network={deployment.network === "mainnet" ? "mainnet" : "testnet"}
            maintainers={board.maintainers}
            governanceConfig={board.governanceConfig}
            bootstrap={board.bootstrap}
            candidates={board.candidates}
            councilRequests={board.councilRequests}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Recent activity" description="Indexed board events and state reconciliations.">
        {visibleEvents.length === 0 ? (
          <EmptyPanel>No activity indexed yet.</EmptyPanel>
        ) : (
          <ol className="space-y-2">
            {visibleEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-xs">
                <Badge>{event.type}</Badge>
                <span className="text-muted">{formatDate(event.occurredAt)}</span>
                <span className="ml-auto font-mono text-[11px] text-muted">
                  {event.blockHeight ?? "pending"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
