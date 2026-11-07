import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IssueActions } from "@/components/platform/issue-actions";
import { PrivateSecurityActions } from "@/components/platform/private-security-actions";
import { S0Actions } from "@/components/platform/s0-actions";
import { Badge, EmptyPanel, PageHeader, SectionCard, Stat } from "@/components/ui";
import { formatNear, formatTimestamp, statusLabel } from "@/lib/format";
import { auth } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/platform/config";
import { readDaoIssueState } from "@/lib/platform/dao-reader";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { getViewerContext, isBoardMaintainer } from "@/lib/platform/viewer";
import { getOptionalSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function issueTone(status: string): "neutral" | "accent" | "warn" | "danger" {
  if (status === "Paid") return "accent";
  if (status === "Escalated" || status === "Refunded") return "danger";
  if (status === "PendingApproval" || status === "MergePending") return "warn";
  return "neutral";
}

export default async function IssuePage({
  params,
}: {
  params: Promise<{ slug: string; issueId: string }>;
}) {
  const { slug, issueId: rawIssueId } = await params;
  const issueId = Number(rawIssueId);
  if (!Number.isInteger(issueId) || issueId < 0) notFound();
  const store = await getPlatformStore();
  const repository = store.getRepositoryBySlug(slug);
  if (!repository || repository.isPrivate) notFound();
  const deployment = store.getDeploymentByRepositoryId(repository.id);
  if (!deployment) notFound();
  const issue = store.getIssue(deployment.boardAccount, issueId);
  if (!issue) notFound();
  const board = store.getBoard(deployment.boardAccount);
  const viewer = await getViewerContext(store);
  const isMaintainerViewer = isBoardMaintainer(board, viewer.nearAccount);
  const isResearcherViewer =
    issue.kind === "PrivateSecurity" &&
    Boolean(issue.security) &&
    Boolean(viewer.githubLogin) &&
    issue.security?.researcher_github.toLowerCase() === viewer.githubLogin?.toLowerCase();
  if (issue.kind === "PrivateSecurity" && !isMaintainerViewer && !isResearcherViewer) {
    notFound();
  }
  const session = await getOptionalSession();
  const accounts = session
    ? await auth.api.listUserAccounts({ headers: await headers() }).catch(() => [])
    : [];
  const githubConnected = accounts.some((account) => account.providerId === "github");
  const config = getPlatformConfig();
  const network = config.network === "mainnet" ? "mainnet" : "testnet";
  const privateRecipientAccount = issue.security
    ? (store.getIdentityByLogin(issue.security.researcher_github)?.nearAccount ?? null)
    : null;
  const s0State =
    issue.tier === "S0"
      ? await readDaoIssueState(config, deployment.daoAccount, {
          issueId: issue.issueId,
          issueNumber: issue.issueNumber,
          addBountyProposalId: issue.s0?.proposal_id ?? null,
          bountyDoneProposalId: issue.s0?.bounty_done_proposal_id ?? null,
          recipient: issue.mergeProof?.pr_author_account ?? null,
        })
      : null;
  const events = store
    .listEvents(deployment.boardAccount, 200)
    .filter((event) => Number(event.payload.issue_id) === issueId);

  return (
    <div className="space-y-7">
      <div>
        <Link href={`/r/${slug}`} className="text-xs text-muted hover:text-accent">
          ← {repository.fullName}
        </Link>
      </div>
      <PageHeader
        eyebrow={`Bounty ${issue.issueNumber ? `#${issue.issueNumber}` : `#${issue.issueId}`}`}
        title={`${issue.tier} ${issue.kind === "PrivateSecurity" ? "security bounty" : "issue bounty"}`}
        description={`Created by ${issue.creator}. ${issue.intendedContributor ? `Intended contributor: ${issue.intendedContributor}.` : ""}`}
      >
        {issue.issueNumber ? (
          <Link
            href={`https://github.com/${repository.fullName}/issues/${issue.issueNumber}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent"
          >
            GitHub issue
          </Link>
        ) : null}
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Badge tone={issueTone(issue.status)}>{statusLabel(issue.status)}</Badge>
        <Badge>{issue.tier}</Badge>
        <Badge>{issue.kind}</Badge>
        {issue.payoutId !== null ? <Badge tone="accent">payout #{issue.payoutId}</Badge> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Amount" value={`${formatNear(issue.amount)} NEAR`} />
        <Stat label="Claims" value={String(issue.claimants.length)} hint={issue.claimants.join(", ") || "none"} />
        <Stat label="Approvals" value={String(issue.approvals.length)} hint="Maintainer or council" />
        <Stat label="Created" value={formatTimestamp(issue.createdAt)} />
      </div>

      {issue.tier === "S0" ? (
        <SectionCard
          title="S0 native settlement"
          description="Approve the AddBounty proposal, register the native bounty, then complete the BountyDone proposal and payout."
        >
          <S0Actions
            slug={slug}
            issueId={issue.issueId}
            issueNumber={issue.issueNumber}
            boardAccount={deployment.boardAccount}
            daoAccount={deployment.daoAccount}
            network={network}
            status={issue.status}
            s0={issue.s0 ?? null}
            addBountyProposal={s0State?.addBountyProposal ?? null}
            nativeBounty={s0State?.nativeBounty ?? null}
            bountyDoneProposal={s0State?.bountyDoneProposal ?? null}
            recipient={issue.mergeProof?.pr_author_account ?? null}
            maintainers={board?.maintainers ?? {}}
            proposalBondNear={config.near.proposalBondNear}
          />
        </SectionCard>
      ) : null}

      {issue.kind === "PrivateSecurity" ? (
        <SectionCard
          title="Private security"
          description="Disclosure is restricted to board maintainers and the credited researcher."
        >
          <PrivateSecurityActions
            slug={slug}
            issueId={issue.issueId}
            status={issue.status}
            security={issue.security}
            canDisclose={isMaintainerViewer && viewer.signedIn}
            researcherAccount={privateRecipientAccount}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Contribute"
        description={
          issue.kind === "PrivateSecurity"
            ? "Approve, disclose, and request payout. Transactions are signed by your NEAR wallet."
            : "Claim, approve, submit merge proof, and request payout. Transactions are signed by your NEAR wallet."
        }
      >
        <IssueActions
          slug={slug}
          issueId={issue.issueId}
          issueNumber={issue.issueNumber}
          boardAccount={deployment.boardAccount}
          daoAccount={deployment.daoAccount}
          network={network}
          tier={issue.tier}
          status={issue.status}
          kind={issue.kind}
          claimants={issue.claimants}
          maintainers={board?.maintainers ?? {}}
          mergeProofAuthorAccount={issue.mergeProof?.pr_author_account ?? null}
          nativeBountyId={s0State?.nativeBounty?.id ?? issue.s0?.native_bounty_id ?? null}
          nativeBountyStatus={s0State?.nativeBounty?.status ?? null}
          privateRecipientAccount={privateRecipientAccount}
          proposalBondNear={config.near.proposalBondNear}
          bountyBondNear={config.near.bountyBondNear}
          payoutBondRequired={board?.payoutBondRequired ?? true}
          githubConnected={githubConnected}
        />
      </SectionCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="Approvals" description="Approval provenance is recorded on-chain.">
          {issue.approvals.length === 0 ? (
            <EmptyPanel>No approvals yet.</EmptyPanel>
          ) : (
            <div className="space-y-2">
              {issue.approvals.map((approval, index) => (
                <div key={`${approval.approver}-${index}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-xs">
                  <span className="font-mono">{approval.approver}</span>
                  <Badge>{approval.source}</Badge>
                  <span className="ml-auto text-muted">{formatTimestamp(approval.at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Completion proof" description="Merge or advisory evidence used to settle the bounty.">
          {issue.mergeProof ? (
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Pull request</dt>
                <dd className="font-mono">#{issue.mergeProof.pr_number}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Author</dt>
                <dd className="font-mono">{issue.mergeProof.pr_author_account ?? issue.mergeProof.pr_author_handle}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Commit</dt>
                <dd className="font-mono">{issue.mergeProof.commit.slice(0, 12)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Source</dt>
                <dd>{issue.mergeProof.source}</dd>
              </div>
            </dl>
          ) : issue.security ? (
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Advisory</dt>
                <dd className="font-mono">{issue.security.ghsa_id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Researcher</dt>
                <dd>{issue.security.researcher_github}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Disclosed</dt>
                <dd>{formatTimestamp(issue.security.disclosed_at)}</dd>
              </div>
            </dl>
          ) : (
            <EmptyPanel>No completion proof recorded yet.</EmptyPanel>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Events" description="Indexed events for this issue.">
        {events.length === 0 ? (
          <EmptyPanel>No events indexed for this issue.</EmptyPanel>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-xs">
                <Badge>{event.type}</Badge>
                <span className="text-muted">{new Date(event.occurredAt).toLocaleString("en-US")}</span>
                <span className="ml-auto font-mono text-[11px] text-muted">{event.blockHeight ?? "pending"}</span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
