import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import { verifyLaunchFunding } from "./funding-verification";

function config() {
  const config = getPlatformConfig();
  config.near.deployerAccount = "bountyboard.testnet";
  return config;
}

function response(receiverId: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "launch-funding",
      result: {
        status: { SuccessValue: "" },
        transaction: {
          signer_id: "founder.testnet",
          receiver_id: receiverId,
          actions: [{ Transfer: { deposit: "17300000000000000000000000" } }],
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("verifyLaunchFunding", () => {
  it("accepts a sufficient transfer from the founder to the deployer", async () => {
    await expect(
      verifyLaunchFunding({
        config: config(),
        txHash: "tx",
        founder: "founder.testnet",
        requiredYocto: "17300000000000000000000000",
        fetchImpl: (async () => response("bountyboard.testnet")) as typeof fetch,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects funding sent to another account", async () => {
    await expect(
      verifyLaunchFunding({
        config: config(),
        txHash: "tx",
        founder: "founder.testnet",
        requiredYocto: "17300000000000000000000000",
        fetchImpl: (async () => response("someone.testnet")) as typeof fetch,
      }),
    ).rejects.toThrow(/must be sent to bountyboard.testnet/);
  });
});
