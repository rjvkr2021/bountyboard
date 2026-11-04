import { nearToYocto } from "near-api-js";

import type { Env } from "./env";

export type WeightKind = "RoleWeight" | "TokenWeight";

export type RoleKind =
  | "Everyone"
  | { Member: string }
  | { Group: string[] };

export type Threshold = string | [number, number];

export interface VotePolicy {
  weight_kind: WeightKind;
  quorum: string;
  threshold: Threshold;
}

export interface RolePermission {
  name: string;
  kind: RoleKind;
  permissions: string[];
  vote_policy: Record<string, VotePolicy>;
}

export interface Policy {
  roles: RolePermission[];
  default_vote_policy: VotePolicy;
  proposal_bond: string;
  proposal_period: string;
  bounty_bond: string;
  bounty_forgiveness_period: string;
}

export interface PolicyParams {
  founder: string;
  bountyboard: string;
  proposalBondNear: number;
  bountyBondNear: number;
  proposalPeriodSecs: number;
  bountyForgivenessPeriodSecs: number;
}

export const COUNCIL_PERMISSIONS = [
  "add_bounty:*",
  "bounty_done:VoteApprove",
  "call:*",
  "transfer:*",
  "add_member_to_role:*",
  "remove_member_from_role:*",
  "config:*",
  "policy:*",
  "policy_add_or_update_role:*",
  "policy_remove_role:*",
  "policy_update_default_vote_policy:*",
  "policy_update_parameters:*",
] as const;

export const BOUNTYBOARD_PERMISSIONS = [
  "add_bounty:AddProposal",
  "bounty_done:VoteApprove",
  "call:AddProposal",
  "call:VoteApprove",
  "call:Finalize",
  "add_member_to_role:AddProposal",
] as const;

export const ALL_PERMISSIONS = ["bounty_done:AddProposal"] as const;

export function secsToNs(seconds: number): string {
  return (BigInt(seconds) * 1_000_000_000n).toString();
}

export function nearToYoctoString(amount: number): string {
  return nearToYocto(amount).toString();
}

export function ratio(numerator: number, denominator: number): [number, number] {
  return [numerator, denominator];
}

export function roleWeightPolicy(threshold: Threshold): VotePolicy {
  return {
    weight_kind: "RoleWeight",
    quorum: "0",
    threshold,
  };
}

export function buildPolicy(params: PolicyParams): Policy {
  const councilVotePolicy: Record<string, VotePolicy> = {
    add_bounty: roleWeightPolicy(ratio(1, 1)),
    call: roleWeightPolicy(ratio(1, 1)),
    add_member_to_role: roleWeightPolicy(ratio(1, 2)),
    remove_member_from_role: roleWeightPolicy(ratio(1, 2)),
  };

  const bountyboardVotePolicy: Record<string, VotePolicy> = {
    bounty_done: roleWeightPolicy("1"),
    call: roleWeightPolicy("1"),
  };

  return {
    roles: [
      {
        name: "council",
        kind: { Group: [params.founder] },
        permissions: [...COUNCIL_PERMISSIONS],
        vote_policy: councilVotePolicy,
      },
      {
        name: "bountyboard",
        kind: { Group: [params.bountyboard] },
        permissions: [...BOUNTYBOARD_PERMISSIONS],
        vote_policy: bountyboardVotePolicy,
      },
      {
        name: "all",
        kind: "Everyone",
        permissions: [...ALL_PERMISSIONS],
        vote_policy: {},
      },
    ],
    default_vote_policy: roleWeightPolicy(ratio(1, 1)),
    proposal_bond: nearToYoctoString(params.proposalBondNear),
    proposal_period: secsToNs(params.proposalPeriodSecs),
    bounty_bond: nearToYoctoString(params.bountyBondNear),
    bounty_forgiveness_period: secsToNs(params.bountyForgivenessPeriodSecs),
  };
}

export function policyParamsFromEnv(env: Env): PolicyParams {
  return {
    founder: env.FOUNDER_ACCOUNT,
    bountyboard: env.BOUNTYBOARD_ACCOUNT,
    proposalBondNear: env.DAO_PROPOSAL_BOND_NEAR,
    bountyBondNear: env.DAO_BOUNTY_BOND_NEAR,
    proposalPeriodSecs: env.DAO_PROPOSAL_PERIOD_SECS,
    bountyForgivenessPeriodSecs: env.DAO_BOUNTY_FORGIVENESS_SECS,
  };
}

export function buildPolicyFromEnv(env: Env): Policy {
  return buildPolicy(policyParamsFromEnv(env));
}
