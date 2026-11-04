import {
  ALL_PERMISSIONS,
  BOUNTYBOARD_PERMISSIONS,
  COUNCIL_PERMISSIONS,
  type Policy,
  type RolePermission,
  type Threshold,
  type VotePolicy,
} from "./policy";

export interface PolicyExpectations {
  bountyboard: string;
  councilRoleName?: string;
}

const BOARD_FORBIDDEN = [
  "add_bounty:VoteApprove",
  "transfer:*",
  "add_member_to_role:VoteApprove",
  "config:*",
  "policy:*",
  "*:*",
];

function thresholdMatches(
  actual: Threshold | undefined,
  expected: Threshold,
): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function checkVotePolicy(
  role: RolePermission,
  proposalKind: string,
  expected: Threshold,
  violations: string[],
): void {
  const votePolicy: VotePolicy | undefined = role.vote_policy[proposalKind];
  if (!votePolicy) {
    violations.push(
      `role ${role.name} is missing the ${proposalKind} vote policy`,
    );
    return;
  }
  if (votePolicy.weight_kind !== "RoleWeight") {
    violations.push(
      `role ${role.name} ${proposalKind} must use RoleWeight, got ${votePolicy.weight_kind}`,
    );
  }
  if (votePolicy.quorum !== "0") {
    violations.push(
      `role ${role.name} ${proposalKind} must have quorum 0, got ${votePolicy.quorum}`,
    );
  }
  if (!thresholdMatches(votePolicy.threshold, expected)) {
    violations.push(
      `role ${role.name} ${proposalKind} threshold must be ${JSON.stringify(
        expected,
      )}, got ${JSON.stringify(votePolicy.threshold)}`,
    );
  }
}

function checkVotePolicyKeys(
  role: RolePermission,
  expected: string[],
  violations: string[],
): void {
  const actual = Object.keys(role.vote_policy).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    violations.push(
      `role ${role.name} vote policy kinds must be ${wanted.join(", ")}, got ${actual.join(", ")}`,
    );
  }
}

function findRole(policy: Policy, name: string): RolePermission | undefined {
  return policy.roles.find((role) => role.name === name);
}

export function verifyPolicy(
  policy: Policy,
  expectations: PolicyExpectations,
): string[] {
  const violations: string[] = [];
  const councilName = expectations.councilRoleName ?? "council";

  const names = policy.roles.map((role) => role.name);
  if (new Set(names).size !== names.length) {
    violations.push("policy contains duplicate role names");
  }

  for (const role of policy.roles) {
    if (role.permissions.includes("*:*")) {
      violations.push(`role ${role.name} must not have *:*`);
    }
    if (/security/i.test(role.name)) {
      violations.push(
        `role ${role.name} must not be a private-security-specific role`,
      );
    }
  }

  const council = findRole(policy, councilName);
  const bountyboard = findRole(policy, "bountyboard");
  const all = findRole(policy, "all");

  if (!council) {
    violations.push(`missing ${councilName} role`);
  }
  if (!bountyboard) {
    violations.push("missing bountyboard role");
  }
  if (!all) {
    violations.push("missing all role");
  }

  if (council) {
    if (
      typeof council.kind === "string" ||
      !("Group" in council.kind) ||
      council.kind.Group.length === 0
    ) {
      violations.push(`${councilName} must be a non-empty group`);
    }
    for (const permission of COUNCIL_PERMISSIONS) {
      if (!council.permissions.includes(permission)) {
        violations.push(`${councilName} is missing ${permission}`);
      }
    }
    checkVotePolicyKeys(
      council,
      [
        "add_bounty",
        "call",
        "add_member_to_role",
        "remove_member_from_role",
      ],
      violations,
    );
    checkVotePolicy(council, "add_bounty", [1, 1], violations);
    checkVotePolicy(council, "call", [1, 1], violations);
    checkVotePolicy(council, "add_member_to_role", [1, 2], violations);
    checkVotePolicy(council, "remove_member_from_role", [1, 2], violations);
  }

  if (bountyboard) {
    const kind = bountyboard.kind;
    const members =
      typeof kind === "object" && "Group" in kind ? kind.Group : [];
    if (members.length !== 1 || members[0] !== expectations.bountyboard) {
      violations.push(
        `bountyboard group must contain exactly ${expectations.bountyboard}`,
      );
    }

    const actual = [...bountyboard.permissions].sort();
    const expected = [...BOUNTYBOARD_PERMISSIONS].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      violations.push(
        `bountyboard permissions must be ${expected.join(", ")}, got ${actual.join(", ")}`,
      );
    }
    for (const permission of BOARD_FORBIDDEN) {
      if (bountyboard.permissions.includes(permission)) {
        violations.push(`bountyboard must not have ${permission}`);
      }
    }

    checkVotePolicyKeys(
      bountyboard,
      ["bounty_done", "call"],
      violations,
    );
    checkVotePolicy(bountyboard, "bounty_done", "1", violations);
    checkVotePolicy(bountyboard, "call", "1", violations);
  }

  if (all) {
    if (all.kind !== "Everyone") {
      violations.push("all role must be Everyone");
    }
    const actual = [...all.permissions].sort();
    const expected = [...ALL_PERMISSIONS].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      violations.push(
        `all role permissions must be ${expected.join(", ")}, got ${actual.join(", ")}`,
      );
    }
    if (Object.keys(all.vote_policy).length !== 0) {
      violations.push("all role must not define vote policies");
    }
  }

  for (const role of policy.roles) {
    if (role.name === councilName || role.name === "bountyboard") {
      continue;
    }
    for (const permission of role.permissions) {
      if (permission.startsWith("call:")) {
        violations.push(
          `role ${role.name} must not receive the call lane (${permission})`,
        );
      }
      if (
        permission === "transfer:*" ||
        permission === "config:*" ||
        permission.startsWith("policy")
      ) {
        violations.push(
          `role ${role.name} must not receive ${permission}`,
        );
      }
    }
  }

  if (!thresholdMatches(policy.default_vote_policy.threshold, [1, 1])) {
    violations.push("default vote policy threshold must be [1, 1]");
  }
  if (policy.default_vote_policy.weight_kind !== "RoleWeight") {
    violations.push("default vote policy must use RoleWeight");
  }
  if (policy.default_vote_policy.quorum !== "0") {
    violations.push("default vote policy quorum must be 0");
  }

  return violations;
}
