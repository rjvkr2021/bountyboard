import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import { calculateLaunchFunding } from "./funding";

describe("calculateLaunchFunding", () => {
  it("derives contract funding from the actual wasm sizes", () => {
    const config = getPlatformConfig();
    config.near.proposalBondNear = "1";
    config.near.launchFundingBufferNear = "0.5";

    const funding = calculateLaunchFunding(config, 2, {
      boardWasmBytes: 522041,
      sputnikWasmBytes: 469723,
    });

    expect(funding.near).toBe("18.41764");
    expect(funding.yocto).toBe("18417640000000000000000000");
    expect(funding.daoStorageYocto).toBe("5197230000000000000000000");
    expect(funding.daoFundingYocto).toBe("7197230000000000000000000");
    expect(funding.boardFundingYocto).toBe("6720410000000000000000000");
    expect(funding.payoutBondReserveYocto).toBe("1000000000000000000000000");
    expect(funding.budgetYocto).toBe("2000000000000000000000000");
  });
});
