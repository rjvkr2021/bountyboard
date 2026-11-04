import { loadOracleEnv } from "../lib/env";
import { callRaw, explorerTxUrl, view } from "../lib/near";
import { parseLinkedIssue } from "./parse-linked-issue";

interface IssueView {
  kind: string;
  status: string;
}

interface TxResult {
  transaction?: { hash: string };
  transaction_outcome?: { id: string };
}

function txHash(result: TxResult): string {
  return result.transaction?.hash ?? result.transaction_outcome?.id ?? "unknown";
}

async function main(): Promise<void> {
  const env = loadOracleEnv({ silent: true });
  console.log(
    `Oracle merge ${env.PR_AUTHOR} PR #${env.PR_NUMBER} on ${env.BOUNTYBOARD_CONTRACT_ID} (${env.NEAR_NETWORK})`,
  );
  const issueNumber = parseLinkedIssue(env.PR_BODY);
  if (issueNumber === null) {
    throw new Error("PR body does not contain Fixes/Closes/Resolves #N");
  }

  const issueId = await view<number | null>(
    env,
    env.BOUNTYBOARD_CONTRACT_ID,
    "get_issue_id_by_number",
    { issue_number: issueNumber },
  );
  if (issueId === null) {
    throw new Error(`No bounty found for issue #${issueNumber}`);
  }
  const issue = await view<IssueView | null>(
    env,
    env.BOUNTYBOARD_CONTRACT_ID,
    "get_issue",
    { issue_id: issueId },
  );
  if (!issue) {
    throw new Error(`No bounty found for issue #${issueNumber}`);
  }
  if (issue.kind !== "PublicIssue") {
    throw new Error(
      `Issue #${issueNumber} is not a public bounty; use mark_security_fixed`,
    );
  }
  if (issue.status !== "Approved") {
    throw new Error(
      `Issue #${issueNumber} is ${issue.status}, expected Approved`,
    );
  }

  const response = (await callRaw(
    env,
    env.NEAR_ORACLE_ACCOUNT,
    env.NEAR_ORACLE_PRIVATE_KEY,
    env.BOUNTYBOARD_CONTRACT_ID,
    "mark_merged",
    {
      issue_id: issueId,
      pr_number: env.PR_NUMBER,
      pr_author_handle: env.PR_AUTHOR,
      commit: env.PR_MERGE_COMMIT,
    },
  )) as TxResult;
  const hash = txHash(response);
  console.log(`Marked issue #${issueNumber} merged: ${hash}`);
  console.log(explorerTxUrl(env.NEAR_NETWORK, hash));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
