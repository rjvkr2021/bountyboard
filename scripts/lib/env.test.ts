import { describe, expect, it } from "vitest";

import { parseEnv, requireSecret, rpcUrl, summarizeEnv } from "./env";

const base = {
  DAO_ACCOUNT: "bounty-dao.testnet",
  BOUNTYBOARD_ACCOUNT: "bountyboard.bounty-dao.testnet",
  FOUNDER_ACCOUNT: "founder.testnet",
  NEAR_ORACLE_ACCOUNT: "oracle.testnet",
  DEPLOYER_ACCOUNT: "deployer.testnet",
};

describe("parseEnv", () => {
  it("applies production-safe defaults", () => {
    const env = parseEnv(base);

    expect(env.NEAR_NETWORK).toBe("testnet");
    expect(env.TREASURY_BUDGET_NEAR).toBe(100);
    expect(env.BOUNTYBOARD_RESERVE_NEAR).toBe(10);
    expect(env.DAO_ACCOUNT).toBe("bounty-dao.testnet");
  });

  it("treats empty values as unset", () => {
    const env = parseEnv({
      ...base,
      TREASURY_BUDGET_NEAR: "",
      NEAR_RPC_URL: "",
      DEPLOYER_PRIVATE_KEY: "",
    });

    expect(env.TREASURY_BUDGET_NEAR).toBe(100);
    expect(env.NEAR_RPC_URL).toBeUndefined();
    expect(env.DEPLOYER_PRIVATE_KEY).toBeUndefined();
  });

  it("fails when a required account is missing", () => {
    const { DAO_ACCOUNT: _dao, ...missing } = base;

    expect(() => parseEnv(missing)).toThrow(/DAO_ACCOUNT/);
  });

  it("rejects malformed account ids", () => {
    expect(() =>
      parseEnv({ ...base, DAO_ACCOUNT: "Not A Valid Account" }),
    ).toThrow(/DAO_ACCOUNT/);
  });

  it("rejects unknown networks", () => {
    expect(() => parseEnv({ ...base, NEAR_NETWORK: "mainframe" })).toThrow(
      /NEAR_NETWORK/,
    );
  });
});

describe("rpcUrl", () => {
  it("defaults per network", () => {
    const env = parseEnv(base);
    expect(rpcUrl(env)).toBe("https://rpc.testnet.near.org");

    const localnet = parseEnv({ ...base, NEAR_NETWORK: "localnet" });
    expect(rpcUrl(localnet)).toBe("http://127.0.0.1:3030");
  });

  it("uses an explicit RPC URL", () => {
    const env = parseEnv({ ...base, NEAR_RPC_URL: "https://rpc.example.org" });
    expect(rpcUrl(env)).toBe("https://rpc.example.org");
  });
});

describe("summarizeEnv", () => {
  it("never prints full secrets", () => {
    const oracleKey = "ed25519:5J9zQqJ8bW7pLqXrS3vN1mK4cD6tH2yF8aG0uE7iB3o";
    const deployerKey = "ed25519:7K2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8n";
    const env = parseEnv({
      ...base,
      NEAR_ORACLE_PRIVATE_KEY: oracleKey,
      DEPLOYER_PRIVATE_KEY: deployerKey,
    });

    const summary = summarizeEnv(env);
    expect(summary).not.toContain(oracleKey);
    expect(summary).not.toContain(deployerKey);
    expect(summary).toContain("ed25...iB3o");
    expect(summary).toContain("ed25...lM8n");
  });
});

describe("requireSecret", () => {
  it("fails when the secret is missing", () => {
    const env = parseEnv(base);
    expect(() => requireSecret(env, "DEPLOYER_PRIVATE_KEY")).toThrow(
      /DEPLOYER_PRIVATE_KEY/,
    );
  });

  it("returns the secret when set", () => {
    const env = parseEnv({ ...base, DEPLOYER_PRIVATE_KEY: "ed25519:secret" });
    expect(requireSecret(env, "DEPLOYER_PRIVATE_KEY")).toBe("ed25519:secret");
  });
});
