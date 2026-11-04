const GITHUB_HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

export function normalizeGithubHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return GITHUB_HANDLE.test(handle) ? handle : null;
}
