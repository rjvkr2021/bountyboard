import { Badge, ErrorPanel, PageHeader, SectionCard, Stat } from "@/components/ui";
import { IndexerButton } from "@/components/platform/indexer-button";
import { getPlatformConfig, missingProductionInputs } from "@/lib/platform/config";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { isPrivateSecurityEvent } from "@/lib/platform/viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function StatusPage() {
  const config = getPlatformConfig();
  const missing = missingProductionInputs(config);
  const store = await getPlatformStore();
  const deployments = store.listDeployments();
  const repositories = store.listRepositories();
  const identities = store.listIdentities();
  const events = store.listEvents(undefined, 20).filter((event) => !isPrivateSecurityEvent(event));
  const issues = repositories.reduce((sum, repository) => {
    const deployment = store.getDeploymentByRepositoryId(repository.id);
    return sum + (deployment ? store.listIssues(deployment.boardAccount).length : 0);
  }, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Platform"
        title="Status and configuration"
        description="Operational view of external dependencies, indexer cursors, and recent activity."
      >
        <IndexerButton />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Repositories" value={String(repositories.length)} hint={`${deployments.filter((item) => item.status === "active").length} active`} />
        <Stat label="Bounties" value={String(issues)} hint="Indexed issues" />
        <Stat label="Identities" value={String(identities.length)} hint="GitHub ↔ NEAR" />
        <Stat label="Events" value={String(events.length)} hint="Recent window" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="Runtime" description="External services used by launch, indexing, and identity.">
          <div className="flex flex-wrap gap-2">
            <Badge>{config.network}</Badge>
            <Badge>kms: {config.kms.provider}</Badge>
            <Badge tone={config.auth.secret && config.auth.databaseUrl ? "accent" : "warn"}>
              auth: {config.auth.secret && config.auth.databaseUrl ? "better auth" : "not configured"}
            </Badge>
            <Badge tone={config.auth.databaseUrl ? "accent" : "warn"}>
              database: {config.auth.databaseUrl ? "postgres" : "missing"}
            </Badge>
          </div>
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Root account</dt>
              <dd className="font-mono">{config.rootAccount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Data store</dt>
              <dd className="font-mono">
                {config.storeDriver === "postgres"
                  ? config.platformDatabaseUrl
                    ? "postgres / platform_state"
                    : "postgres / missing connection"
                  : config.dataFile}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Production inputs" description="Required to launch boards and run live integrations.">
          {missing.length === 0 ? (
            <p className="text-xs text-muted">No missing inputs for the current mode.</p>
          ) : (
            <ErrorPanel>
              <p className="font-medium">Missing configuration</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {missing.map((name) => (
                  <li key={name} className="font-mono">{name}</li>
                ))}
              </ul>
            </ErrorPanel>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Indexer cursors" description="One cursor per active board, updated by the RPC reconciliation indexer.">
        {deployments.filter((item) => item.boardAccount).length === 0 ? (
          <p className="text-xs text-muted">No boards to index.</p>
        ) : (
          <div className="space-y-2">
            {deployments.filter((item) => item.boardAccount).map((deployment) => {
              const cursor = store.getCursor(deployment.boardAccount);
              return (
                <div key={deployment.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-xs">
                  <span className="font-mono">{deployment.slug}</span>
                  <Badge tone={deployment.status === "active" ? "accent" : "warn"}>{deployment.status}</Badge>
                  <span className="ml-auto font-mono text-muted">
                    {cursor ? `block ${cursor.blockHeight ?? "-"}` : "not indexed"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent events" description="Newest events across all boards.">
        <ol className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-xs">
              <Badge>{event.type}</Badge>
              <span className="font-mono text-[11px] text-muted">{event.boardAccount || "platform"}</span>
              <span className="ml-auto text-muted">{new Date(event.occurredAt).toLocaleString("en-US")}</span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
