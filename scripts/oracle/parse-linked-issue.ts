const FENCED_CODE = /```[\s\S]*?```/g;
const LINKED_ISSUE =
  /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s*:?\s*#(\d+)\b/i;

export function parseLinkedIssue(body: string): number | null {
  const withoutCode = body.replace(FENCED_CODE, " ");
  const match = LINKED_ISSUE.exec(withoutCode);
  if (!match?.[1]) {
    return null;
  }
  const issueNumber = Number(match[1]);
  return Number.isSafeInteger(issueNumber) && issueNumber > 0
    ? issueNumber
    : null;
}
