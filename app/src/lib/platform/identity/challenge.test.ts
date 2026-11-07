import { describe, expect, it } from "vitest";
import { getPlatformConfig } from "../config";
import { createIdentityChallenge, readIdentityChallenge } from "./challenge";

function config() {
  const config = getPlatformConfig();
  config.auth.secret = "identity-challenge-test-secret-1234567890";
  return config;
}

describe("identity challenges", () => {
  it("creates and verifies a signed challenge for the same user", () => {
    const challenge = createIdentityChallenge({
      config: config(),
      userId: "user-1",
      action: "link",
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
      recipient: "localhost:3000",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const payload = readIdentityChallenge(
      challenge.token,
      "user-1",
      config(),
      new Date("2026-01-01T00:05:00.000Z"),
    );

    expect(payload).toMatchObject({
      action: "link",
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
      recipient: "localhost:3000",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    expect(payload.message).toContain("GitHub: alice (42)");
    expect(Buffer.from(payload.nonce, "base64")).toHaveLength(32);
  });

  it("rejects tampered, expired, and cross-user challenges", () => {
    const challenge = createIdentityChallenge({
      config: config(),
      userId: "user-1",
      action: "unlink",
      githubUserId: 42,
      githubLogin: "alice",
      nearAccount: "alice.testnet",
      recipient: "localhost:3000",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(() =>
      readIdentityChallenge(`${challenge.token}x`, "user-1", config()),
    ).toThrow(/Invalid identity challenge/);
    expect(() =>
      readIdentityChallenge(challenge.token, "user-2", config()),
    ).toThrow(/Invalid identity challenge/);
    expect(() =>
      readIdentityChallenge(
        challenge.token,
        "user-1",
        config(),
        new Date("2026-01-01T00:11:00.000Z"),
      ),
    ).toThrow(/expired/);
  });
});
