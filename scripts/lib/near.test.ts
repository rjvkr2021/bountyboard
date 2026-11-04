import { describe, expect, it } from "vitest";

import { DEFAULT_GAS, TGAS, isAccountMissingError } from "./near";

describe("isAccountMissingError", () => {
  it("detects RPC account errors", () => {
    expect(
      isAccountMissingError({
        type: "AccountDoesNotExist",
        message: "Account does not exist while viewing",
      }),
    ).toBe(true);
  });

  it("detects wrapped causes", () => {
    expect(
      isAccountMissingError(
        new Error("rpc failed", {
          cause: { message: "account does not exist" },
        }),
      ),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isAccountMissingError(new Error("timeout"))).toBe(false);
    expect(isAccountMissingError(undefined)).toBe(false);
  });
});

describe("gas constants", () => {
  it("expresses default gas in TGas", () => {
    expect(TGAS).toBe(1_000_000_000_000n);
    expect(DEFAULT_GAS).toBe(30n * TGAS);
  });
});
