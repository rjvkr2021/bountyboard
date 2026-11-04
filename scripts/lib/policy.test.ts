import { describe, expect, it } from "vitest";

import {
  BOUNTYBOARD_PERMISSIONS,
  COUNCIL_PERMISSIONS,
  buildPolicy,
  type Policy,
  type RolePermission,
} from "./policy";

const params = {
  founder: "founder.testnet",
  bountyboard: "bountyboard.bounty-dao.testnet",
  proposalBondNear: 1,
  bountyBondNear: 1,
  proposalPeriodSecs: 604_800,
  bountyForgivenessPeriodSecs: 86_400,
};

function role(policy: Policy, name: string): RolePermission {
  const found = policy.roles.find((item) => item.name === name);
  if (!found) {
    throw new Error(`missing role ${name}`);
  }
  return found;
}

describe("buildPolicy", () => {
  const policy = buildPolicy(params);

  it("matches the reviewed snapshot", () => {
    expect(policy).toMatchSnapshot();
  });

  it("creates exactly the three planned roles", () => {
    expect(policy.roles.map((item) => item.name).sort()).toEqual([
      "all",
      "bountyboard",
      "council",
    ]);
  });

  it("grants the council the expected permissions", () => {
    expect(new Set(role(policy, "council").permissions)).toEqual(
      new Set(COUNCIL_PERMISSIONS),
    );
  });

  it("grants the bountyboard only the expected permissions", () => {
    expect(new Set(role(policy, "bountyboard").permissions)).toEqual(
      new Set(BOUNTYBOARD_PERMISSIONS),
    );
  });

  it("keeps the bountyboard group to the single contract account", () => {
    expect(role(policy, "bountyboard").kind).toEqual({
      Group: [params.bountyboard],
    });
  });

  it("keeps the council group to the founder", () => {
    expect(role(policy, "council").kind).toEqual({
      Group: [params.founder],
    });
  });

  it("lets everyone add bounty_done proposals", () => {
    const all = role(policy, "all");
    expect(all.kind).toBe("Everyone");
    expect(all.permissions).toEqual(["bounty_done:AddProposal"]);
  });

  it("defines the council vote policies", () => {
    expect(role(policy, "council").vote_policy).toEqual({
      add_bounty: {
        weight_kind: "RoleWeight",
        quorum: "0",
        threshold: [1, 1],
      },
      call: {
        weight_kind: "RoleWeight",
        quorum: "0",
        threshold: [1, 1],
      },
      add_member_to_role: {
        weight_kind: "RoleWeight",
        quorum: "0",
        threshold: [1, 2],
      },
      remove_member_from_role: {
        weight_kind: "RoleWeight",
        quorum: "0",
        threshold: [1, 2],
      },
    });
  });

  it("defines the bountyboard vote policies", () => {
    expect(role(policy, "bountyboard").vote_policy).toEqual({
      bounty_done: {
        weight_kind: "RoleWeight",
        quorum: "0",
        threshold: "1",
      },
      call: {
        weight_kind: "RoleWeight",
        quorum: "0",
        threshold: "1",
      },
    });
  });

  it("defaults every other proposal kind to full council", () => {
    expect(policy.default_vote_policy).toEqual({
      weight_kind: "RoleWeight",
      quorum: "0",
      threshold: [1, 1],
    });
  });
});

describe("policy invariants", () => {
  const policy = buildPolicy(params);
  const bountyboard = role(policy, "bountyboard");

  it.each([
    "add_bounty:VoteApprove",
    "transfer:*",
    "add_member_to_role:VoteApprove",
    "config:*",
    "policy:*",
    "*:*",
  ])("does not give the bountyboard %s", (permission) => {
    expect(bountyboard.permissions).not.toContain(permission);
  });

  it("lets the bountyboard request council promotion without voting", () => {
    expect(bountyboard.permissions).toContain("add_member_to_role:AddProposal");
    expect(bountyboard.permissions).not.toContain("add_member_to_role:VoteApprove");
    expect(bountyboard.permissions).not.toContain("add_member_to_role:*");
  });

  it("does not let the bountyboard remove council members", () => {
    expect(
      bountyboard.permissions.some((permission) =>
        permission.startsWith("remove_member_from_role:"),
      ),
    ).toBe(false);
  });

  it("uses the reviewed council membership and call thresholds", () => {
    expect(role(policy, "council").vote_policy.call?.threshold).toEqual([1, 1]);
    expect(role(policy, "council").vote_policy.add_bounty?.threshold).toEqual([1, 1]);
    expect(role(policy, "council").vote_policy.add_member_to_role?.threshold).toEqual([
      1,
      2,
    ]);
    expect(
      role(policy, "council").vote_policy.remove_member_from_role?.threshold,
    ).toEqual([1, 2]);
  });

  it("never grants wildcard permissions", () => {
    for (const item of policy.roles) {
      expect(item.permissions).not.toContain("*:*");
    }
  });

  it("has exactly four council vote policies", () => {
    expect(Object.keys(role(policy, "council").vote_policy).sort()).toEqual([
      "add_bounty",
      "add_member_to_role",
      "call",
      "remove_member_from_role",
    ]);
  });

  it("has exactly two bountyboard vote policies", () => {
    expect(Object.keys(bountyboard.vote_policy).sort()).toEqual([
      "bounty_done",
      "call",
    ]);
  });

  it("does not create a private-security role", () => {
    expect(
      policy.roles.filter((item) => /security/i.test(item.name)),
    ).toHaveLength(0);
  });

  it("reads bonds and periods from parameters", () => {
    const custom = buildPolicy({
      ...params,
      proposalBondNear: 0.5,
      bountyBondNear: 0.25,
      proposalPeriodSecs: 60,
      bountyForgivenessPeriodSecs: 120,
    });

    expect(custom.proposal_bond).toBe("500000000000000000000000");
    expect(custom.bounty_bond).toBe("250000000000000000000000");
    expect(custom.proposal_period).toBe("60000000000");
    expect(custom.bounty_forgiveness_period).toBe("120000000000");
  });
});
