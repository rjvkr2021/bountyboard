import { JsonRpcProvider } from "near-api-js";
import type { PlatformConfig } from "./config";

export interface DaoProposalView {
  id: number;
  description: string;
  status: string;
  kind: unknown;
}

export interface DaoBountyView {
  id: number;
  description: string;
  amount: string;
  status: string;
}

export interface DaoIssueState {
  nativeBounty: DaoBountyView | null;
  addBountyProposal: DaoProposalView | null;
  bountyDoneProposal: DaoProposalView | null;
}

export interface DaoBudgetState {
  availableAmount: string;
  budgetProposal: DaoProposalView | null;
}

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function proposalKind(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function readDaoIssueState(
  config: PlatformConfig,
  daoAccount: string,
  input: {
    issueId: number;
    issueNumber: number | null;
    addBountyProposalId: number | null;
    bountyDoneProposalId: number | null;
    recipient: string | null;
  },
): Promise<DaoIssueState> {
  if (!daoAccount) {
    return { nativeBounty: null, addBountyProposal: null, bountyDoneProposal: null };
  }
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  const call = async <T>(method: string, args: Record<string, unknown> = {}): Promise<T | null> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return (await provider.callFunction({
          contractId: daoAccount,
          method,
          args,
        })) as T;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return null;
  };

  const [bountiesResult, lastProposalIdResult] = await Promise.all([
    call<unknown[]>("get_bounties", { from_index: 0, limit: 100 }),
    call<number | string>("get_last_proposal_id"),
  ]);

  const bounties = Array.isArray(bountiesResult) ? bountiesResult : [];
  const expectedDescription =
    input.issueNumber !== null
      ? `bountyboard:${input.issueId}:${input.issueNumber}`
      : "";
  const nativeBounty =
    bounties
      .map((raw) => {
        const bounty = raw as Record<string, unknown>;
        return {
          id: asNumber(bounty.id),
          description: String(bounty.description ?? ""),
          amount: String(bounty.amount ?? "0"),
          status: String(bounty.status ?? ""),
        };
      })
      .find((bounty) => expectedDescription && bounty.description === expectedDescription) ?? null;

  const proposals = new Map<number, DaoProposalView>();
  const loadProposal = async (id: number | null): Promise<DaoProposalView | null> => {
    if (id === null || id < 0) return null;
    if (proposals.has(id)) return proposals.get(id) ?? null;
    const raw = await call<Record<string, unknown>>("get_proposal", { id });
    if (!raw) return null;
    const proposal: DaoProposalView = {
      id: asNumber(raw.id ?? id),
      description: String(raw.description ?? ""),
      status: String(raw.status ?? ""),
      kind: raw.kind ?? null,
    };
    proposals.set(proposal.id, proposal);
    return proposal;
  };

  const addBountyProposal = await loadProposal(input.addBountyProposalId);
  let bountyDoneProposal = await loadProposal(input.bountyDoneProposalId);

  if (!bountyDoneProposal && nativeBounty && input.recipient) {
    const lastProposalId = asNumber(lastProposalIdResult);
    const first = Math.max(0, lastProposalId - 12);
    for (let id = lastProposalId - 1; id >= first; id -= 1) {
      const proposal = await loadProposal(id);
      if (!proposal) continue;
      const kind = proposalKind(proposal.kind);
      const done = kind?.BountyDone as Record<string, unknown> | undefined;
      if (
        done &&
        asNumber(done.bounty_id) === nativeBounty.id &&
        String(done.receiver_id ?? "") === input.recipient
      ) {
        bountyDoneProposal = proposal;
        break;
      }
    }
  }

  return { nativeBounty, addBountyProposal, bountyDoneProposal };
}


export async function readDaoBudgetState(
  config: PlatformConfig,
  daoAccount: string,
  boardAccount: string,
): Promise<DaoBudgetState> {
  if (!daoAccount) return { availableAmount: "0", budgetProposal: null };
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  const call = async <T>(method: string, args: Record<string, unknown> = {}): Promise<T | null> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return (await provider.callFunction({
          contractId: daoAccount,
          method,
          args,
        })) as T;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return null;
  };
  const [available, lastProposalId] = await Promise.all([
    call<string | number>("get_available_amount"),
    call<number | string>("get_last_proposal_id"),
  ]);
  const last = asNumber(lastProposalId);
  const first = Math.max(0, last - 12);
  for (let id = last - 1; id >= first; id -= 1) {
    const raw = await call<Record<string, unknown>>("get_proposal", { id });
    if (!raw) continue;
    const status = String(raw.status ?? "");
    if (status !== "InProgress") continue;
    const kind = proposalKind(raw.kind);
    const callKind = kind?.FunctionCall as Record<string, unknown> | undefined;
    if (!callKind || String(callKind.receiver_id ?? "") !== boardAccount) continue;
    const actions = Array.isArray(callKind.actions) ? callKind.actions : [];
    const firstAction = actions[0] as Record<string, unknown> | undefined;
    if (String(firstAction?.method_name ?? "") !== "set_budget") continue;
    return {
      availableAmount: String(available ?? "0"),
      budgetProposal: {
        id: asNumber(raw.id ?? id),
        description: String(raw.description ?? ""),
        status,
        kind: raw.kind ?? null,
      },
    };
  }
  return { availableAmount: String(available ?? "0"), budgetProposal: null };
}
