import { NextResponse } from "next/server";
import { getPlatformConfig, missingProductionInputs } from "@/lib/platform/config";
import { getPlatformStore } from "@/lib/platform/store-singleton";
import { isPrivateSecurityEvent } from "@/lib/platform/viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const config = getPlatformConfig();
  const store = await getPlatformStore();
  const deployments = store.listDeployments();
  return NextResponse.json({
    config: {
      network: config.network,
      rootAccount: config.rootAccount,
      kmsProvider: config.kms.provider,
    },
    missingProductionInputs: missingProductionInputs(config),
    counts: {
      repositories: store.listRepositories().length,
      deployments: deployments.length,
      active: deployments.filter((deployment) => deployment.status === "active").length,
      failed: deployments.filter((deployment) => deployment.status === "failed").length,
      boards: store.listBoards().length,
      issues: store.listRepositories().reduce((sum, repository) => {
        const deployment = store.getDeploymentByRepositoryId(repository.id);
        return sum + (deployment ? store.listIssues(deployment.boardAccount).length : 0);
      }, 0),
      identities: store.listIdentities().length,
    },
    cursors: deployments
      .filter((deployment) => deployment.boardAccount)
      .map((deployment) => ({
        boardAccount: deployment.boardAccount,
        cursor: store.getCursor(deployment.boardAccount),
      })),
    recentEvents: store.listEvents(undefined, 20).filter((event) => !isPrivateSecurityEvent(event)),
  });
}
