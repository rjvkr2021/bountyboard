import { describe, expect, it } from "vitest";

import { verifyPolicy } from "./policy-check";
import { buildPolicy, type Policy } from "./policy";

const params = {
  founder: "founder.testnet",
  bountyboard: "bountyboard.bounty-dao.testnet",
  proposalBondNear: 1,
  bountyBondNear: 1,
  proposalPeriodSecs: 604_800,
  bountyForgivenessPeriodSecs: 86_400,
};

const expectations = { bountyboard: params.bountyboard };

function tampered(mutate: (policy: Policy) => void): Policy {
  const policy = structuredClone(buildPolicy(params));
  mutate(policy);
  return policy;
}

describe("verifyPolicy", () => {
  it("accepts the reviewed policy", () => {
    expect(verifyPolicy(buildPolicy(params), expectations)).toEqual([]);
  });

  it("rejects a bountyboard with transfer permissions", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        const board = policy.roles.find((role) => role.name === "bountyboard");
        board?.permissions.push("transfer:*");
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/bountyboard/);
  });

  it("rejects a lowered bountyboard vote policy", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        const board = policy.roles.find((role) => role.name === "bountyboard");
        if (board?.vote_policy.call) {
          board.vote_policy.call.threshold = [1, 2];
        }
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/bounty_done|call/);
  });

  it("rejects a lowered council call threshold", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        const council = policy.roles.find((role) => role.name === "council");
        if (council?.vote_policy.call) {
          council.vote_policy.call.threshold = [1, 2];
        }
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/council call/);
  });

  it("rejects wildcard permissions", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        policy.roles[0]?.permissions.push("*:*");
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/\*:\*/);
  });

  it("rejects a private-security role", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        policy.roles.push({
          name: "security",
          kind: "Everyone",
          permissions: ["bounty_done:AddProposal"],
          vote_policy: {},
        });
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/security/);
  });

  it("rejects a call lane on any other role", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        policy.roles.push({
          name: "helper",
          kind: { Group: ["helper.testnet"] },
          permissions: ["call:AddProposal"],
          vote_policy: {},
        });
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/call lane/);
  });

  it("rejects the wrong bountyboard group", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        const board = policy.roles.find((role) => role.name === "bountyboard");
        board!.kind = { Group: ["attacker.testnet"] };
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/bountyboard group/);
  });

  it("rejects a changed default vote policy", () => {
    const violations = verifyPolicy(
      tampered((policy) => {
        policy.default_vote_policy.threshold = [1, 2];
      }),
      expectations,
    );

    expect(violations.join("\n")).toMatch(/default vote policy/);
  });
});
