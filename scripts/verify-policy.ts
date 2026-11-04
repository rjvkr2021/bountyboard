import { loadEnv } from "./lib/env";
import { view } from "./lib/near";
import { verifyPolicy } from "./lib/policy-check";
import type { Policy } from "./lib/policy";

async function main(): Promise<void> {
  const env = loadEnv();
  const policy = await view<Policy>(env, env.DAO_ACCOUNT, "get_policy");

  const violations = verifyPolicy(policy, {
    bountyboard: env.BOUNTYBOARD_ACCOUNT,
    councilRoleName: env.COUNCIL_ROLE_NAME,
  });

  if (violations.length > 0) {
    console.error(`Policy verification failed for ${env.DAO_ACCOUNT}:`);
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Policy verified for ${env.DAO_ACCOUNT}`);
  console.log(JSON.stringify(policy, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
