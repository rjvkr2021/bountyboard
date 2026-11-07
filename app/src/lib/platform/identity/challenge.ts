import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PlatformConfig } from "../config";
import { IdentityError } from "./errors";

export type IdentityAction = "link" | "unlink";

export interface IdentityChallenge {
  version: 1;
  userId: string;
  action: IdentityAction;
  githubUserId: number;
  githubLogin: string;
  nearAccount: string;
  recipient: string;
  network: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface CreateIdentityChallengeInput {
  config: PlatformConfig;
  userId: string;
  action: IdentityAction;
  githubUserId: number;
  githubLogin: string;
  nearAccount: string;
  recipient: string;
  now?: Date;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;

function challengeSecret(config: PlatformConfig): string {
  if (!config.auth.secret) {
    throw new IdentityError(500, "BETTER_AUTH_SECRET is required for identity challenges");
  }
  return config.auth.secret;
}

function encode(payload: IdentityChallenge, config: PlatformConfig): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", challengeSecret(config)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createIdentityChallenge(input: CreateIdentityChallengeInput): {
  token: string;
  message: string;
  nonce: string;
  recipient: string;
  expiresAt: string;
} {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const nonce = randomBytes(32).toString("base64");
  const message = [
    "BountyBoard identity link",
    `Action: ${input.action}`,
    `GitHub: ${input.githubLogin} (${input.githubUserId})`,
    `NEAR: ${input.nearAccount}`,
    `Network: ${input.config.network}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
  ].join("\n");

  const payload: IdentityChallenge = {
    version: 1,
    userId: input.userId,
    action: input.action,
    githubUserId: input.githubUserId,
    githubLogin: input.githubLogin,
    nearAccount: input.nearAccount,
    recipient: input.recipient,
    network: input.config.network,
    nonce,
    message,
    expiresAt,
  };

  return {
    token: encode(payload, input.config),
    message,
    nonce,
    recipient: input.recipient,
    expiresAt,
  };
}

export function readIdentityChallenge(
  token: string,
  userId: string,
  config: PlatformConfig,
  now: Date = new Date(),
): IdentityChallenge {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) {
    throw new IdentityError(400, "Invalid identity challenge");
  }

  const expected = createHmac("sha256", challengeSecret(config)).update(body).digest("base64url");
  if (!signaturesMatch(signature, expected)) {
    throw new IdentityError(400, "Invalid identity challenge");
  }

  let payload: IdentityChallenge;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as IdentityChallenge;
  } catch {
    throw new IdentityError(400, "Invalid identity challenge");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    payload.version !== 1 ||
    payload.userId !== userId ||
    (payload.action !== "link" && payload.action !== "unlink") ||
    typeof payload.githubUserId !== "number" ||
    typeof payload.githubLogin !== "string" ||
    typeof payload.nearAccount !== "string" ||
    typeof payload.recipient !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.message !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    throw new IdentityError(400, "Invalid identity challenge");
  }

  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new IdentityError(400, "Identity challenge expired. Sign the message again.");
  }

  return payload;
}
