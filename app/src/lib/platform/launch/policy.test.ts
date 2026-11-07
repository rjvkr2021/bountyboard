import { describe, expect, it } from "vitest";
import { buildLaunchPolicy, nearToYoctoString, secsToNs } from "./policy";

describe("launch policy", () => {
  const policy = buildLaunchPolicy({
    council: ["founder.testnet"],
    bountyboard: "sample-board.testnet",
    proposalBondNear: "1",
    bountyBondNear: "1",
    proposalPeriodSecs: 60,
    bountyForgivenessPeriodSecs: 30,
  });

  it("grants council and board scoped permissions", () => {
    const council = policy.roles.find((role) => role.name === "council");
    const board = policy.roles.find((role) => role.name === "bountyboard");
    expect(council?.kind).toEqual({ Group: ["founder.testnet"] });
    expect(board?.kind).toEqual({ Group: ["sample-board.testnet"] });
    expect(council?.permissions).toContain("transfer:*");
    expect(board?.permissions).toContain("call:Finalize");
    expect(board?.permissions).not.toContain("transfer:*");
  });

  it("converts bonds and periods", () => {
    expect(nearToYoctoString("1.5")).toBe("1500000000000000000000000");
    expect(secsToNs(60)).toBe("60000000000");
    expect(policy.proposal_bond).toBe("1000000000000000000000000");
  });
});
