import { JsonRpcProvider, PublicKey } from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";
import type { PlatformConfig } from "../config";
import { IdentityError } from "./errors";

export interface VerifyIdentitySignatureInput {
  config: PlatformConfig;
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  recipient: string;
  nonce: string;
}

export async function verifyIdentitySignature(input: VerifyIdentitySignatureInput): Promise<void> {
  let publicKey: PublicKey;
  try {
    publicKey = PublicKey.fromString(input.publicKey);
  } catch {
    throw new IdentityError(400, "The wallet returned an invalid public key");
  }

  const signature = Buffer.from(input.signature, "base64");
  if (signature.length === 0) {
    throw new IdentityError(400, "The wallet returned an invalid signature");
  }

  const nonce = Buffer.from(input.nonce, "base64");
  if (nonce.length !== 32) {
    throw new IdentityError(400, "Invalid identity challenge nonce");
  }

  const provider = new JsonRpcProvider({ url: input.config.rpcUrl });

  try {
    await verifyMessage({
      signerAccountId: input.accountId,
      signerPublicKey: publicKey,
      payload: {
        message: input.message,
        recipient: input.recipient,
        nonce: new Uint8Array(nonce),
      },
      signature,
      provider,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Signature verification failed";
    if (/does not have FullAccess|access key/i.test(detail)) {
      throw new IdentityError(403, "The selected wallet key is not a full-access key for this NEAR account");
    }
    throw new IdentityError(401, `NEAR signature verification failed: ${detail}`);
  }
}
