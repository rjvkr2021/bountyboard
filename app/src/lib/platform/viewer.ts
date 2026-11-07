import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { BoardSnapshot } from "./types";
import type { PlatformStore } from "./store";
import { getOptionalSession } from "@/lib/session";

export interface ViewerContext {
  signedIn: boolean;
  githubLogin: string | null;
  nearAccount: string | null;
}

export async function getViewerContext(store: PlatformStore): Promise<ViewerContext> {
  const session = await getOptionalSession();
  if (!session) return { signedIn: false, githubLogin: null, nearAccount: null };
  try {
    const accounts = await auth.api.listUserAccounts({ headers: await headers() });
    const github = accounts.find((account) => account.providerId === "github");
    if (!github) return { signedIn: true, githubLogin: null, nearAccount: null };
    const githubUserId = Number(github.accountId);
    const identity = Number.isSafeInteger(githubUserId)
      ? store.getIdentityByUserId(githubUserId)
      : null;
    return {
      signedIn: true,
      githubLogin: identity?.githubLogin ?? null,
      nearAccount: identity?.nearAccount ?? null,
    };
  } catch {
    return { signedIn: true, githubLogin: null, nearAccount: null };
  }
}

export function isBoardMaintainer(
  board: BoardSnapshot | null | undefined,
  nearAccount: string | null,
): boolean {
  return Boolean(board && nearAccount && board.maintainers[nearAccount]);
}


export function isPrivateSecurityEvent(event: {
  type: string;
  payload: Record<string, unknown>;
}): boolean {
  const payload = event.payload ?? {};
  return (
    typeof payload.private_ref === "string" ||
    typeof payload.ghsa_id === "string" ||
    typeof payload.advisory_url === "string" ||
    typeof payload.researcher_github === "string" ||
    ["private_bounty_created", "private_bounty_cancelled", "security_fixed", "security_approval_conflict"].includes(
      event.type,
    )
  );
}
