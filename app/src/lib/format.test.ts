import { describe, expect, it } from "vitest";
import {
  formatNear,
  formatTimestamp,
  nearToYocto,
  shortenAccount,
  statusLabel,
} from "./format";

describe("amount formatting", () => {
  it("converts NEAR to yocto without floating point loss", () => {
    expect(nearToYocto("1")).toBe("1000000000000000000000000");
    expect(nearToYocto("1.5")).toBe("1500000000000000000000000");
    expect(nearToYocto("0.000001")).toBe("1000000000000000000");
    expect(() => nearToYocto("-1")).toThrow();
  });

  it("formats yocto as NEAR", () => {
    expect(formatNear("1000000000000000000000000")).toBe("1.00");
    expect(formatNear("1500000000000000000000000", 1)).toBe("1.5");
    expect(formatNear("0")).toBe("0.00");
  });
});

describe("display helpers", () => {
  it("shortens long accounts", () => {
    expect(shortenAccount("bountyboard.bounty-dao.bountyboard.testnet")).toContain("…");
    expect(shortenAccount("alice.testnet")).toBe("alice.testnet");
  });

  it("labels camel-case statuses", () => {
    expect(statusLabel("PayoutRequested")).toBe("Payout Requested");
  });

  it("formats nanosecond timestamps", () => {
    expect(formatTimestamp("1700000000000000000")).toContain("2023");
  });
});
