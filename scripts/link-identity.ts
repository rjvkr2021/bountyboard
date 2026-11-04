import { loadEnv, requireSecret } from "./lib/env";
import { normalizeGithubHandle } from "./lib/github";
import { callRaw, explorerTxUrl } from "./lib/near";

interface TxResult {
  transaction?: { hash: string };
  transaction_outcome?: { id: string };
}

function txHash(result: TxResult): string {
  return result.transaction?.hash ?? result.transaction_outcome?.id ?? "unknown";
}

function usage(): string {
  return "Usage: npm run oracle:link-identity -- <github-handle> <near-account> [--dry-run] --confirm";
}

async function verifyGithubHandle(
  handle: string,
  token: string | undefined,
): Promise<void> {
  if (!token) {
    console.log("GITHUB_TOKEN is unset; skipping GitHub handle verification");
    return;
  }
  const response = await fetch(`https://api.github.com/users/${handle}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "bountyboard-oracle",
    },
  });
  if (response.status === 404) {
    throw new Error(`GitHub handle ${handle} does not exist`);
  }
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  const user = (await response.json()) as { login?: string };
  if (user.login?.toLowerCase() !== handle) {
    throw new Error(`GitHub returned unexpected login for ${handle}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const confirmed = args.includes("--confirm");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional.length !== 2) {
    throw new Error(usage());
  }
  const rawHandle = positional[0]!;
  const nearAccount = positional[1]!;
  const handle = normalizeGithubHandle(rawHandle);
  if (!handle) {
    throw new Error(`Invalid GitHub handle: ${rawHandle}`);
  }
  if (!dryRun && !confirmed) {
    throw new Error(`${usage()}\nPass --confirm to broadcast the link transaction.`);
  }

  const env = loadEnv({ silent: true });
  const contractId = env.BOUNTYBOARD_CONTRACT_ID ?? env.BOUNTYBOARD_ACCOUNT;
  await verifyGithubHandle(handle, process.env.GITHUB_TOKEN);

  console.log(
    `Linking GitHub @${handle} to ${nearAccount} on ${contractId} (${env.NEAR_NETWORK})`,
  );
  console.log(
    "Ownership must be confirmed out-of-band by the oracle; this is not a GitHub OAuth flow.",
  );
  if (dryRun) {
    console.log("Dry run: no transaction sent");
    return;
  }

  const secret = requireSecret(env, "NEAR_ORACLE_PRIVATE_KEY");
  const response = (await callRaw(
    env,
    env.NEAR_ORACLE_ACCOUNT,
    secret,
    contractId,
    "link_identity",
    { github_handle: handle, near_account: nearAccount },
  )) as TxResult;
  const hash = txHash(response);
  console.log(`Linked @${handle} to ${nearAccount}: ${hash}`);
  console.log(explorerTxUrl(env.NEAR_NETWORK, hash));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
