import { auth } from "@/lib/auth";
import { IdentityError } from "./errors";

const GITHUB_USER_URL = "https://api.github.com/user";

export interface GithubIdentity {
  userId: number;
  login: string;
}

interface GithubUserResponse {
  id?: unknown;
  login?: unknown;
}

export async function getGithubAccessToken(headers: Headers): Promise<string> {
  const accounts = await auth.api.listUserAccounts({ headers });
  const account = accounts.find((candidate) => candidate.providerId === "github");
  if (!account) {
    throw new IdentityError(401, "Sign in with GitHub to continue");
  }
  const token = await auth.api.getAccessToken({
    body: { accountId: account.id },
    headers,
  });
  return token.accessToken;
}

export async function getGithubIdentity(headers: Headers): Promise<GithubIdentity> {
  const accessToken = await getGithubAccessToken(headers);
  let response: Response | null = null;
  let lastFetchError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(GITHUB_USER_URL, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "BountyBoard",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      });
      if (response.status < 500) break;
    } catch (fetchError) {
      lastFetchError = fetchError;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (!response) {
    const detail = lastFetchError instanceof Error ? lastFetchError.message : String(lastFetchError);
    throw new IdentityError(502, `GitHub profile request failed: ${detail}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new IdentityError(401, "GitHub rejected the stored session. Sign in again.");
  }
  if (!response.ok) {
    throw new IdentityError(502, `GitHub returned HTTP ${response.status}`);
  }

  const profile = (await response.json().catch(() => null)) as GithubUserResponse | null;
  if (
    !profile ||
    typeof profile.id !== "number" ||
    !Number.isSafeInteger(profile.id) ||
    typeof profile.login !== "string" ||
    profile.login.length === 0
  ) {
    throw new IdentityError(502, "GitHub returned an invalid profile");
  }

  return { userId: profile.id, login: profile.login };
}
