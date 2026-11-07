import { IdentityError } from "./identity/errors";

const GITHUB_REPOS_URL =
  "https://api.github.com/user/repos?affiliation=owner,organization_member&visibility=public&per_page=100&sort=updated";

interface GithubRepositoryResponse {
  id?: unknown;
  name?: unknown;
  full_name?: unknown;
  private?: unknown;
  default_branch?: unknown;
  html_url?: unknown;
  owner?: { login?: unknown } | null;
  permissions?: { admin?: unknown } | null;
}

export interface GithubAdminRepository {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
}

export async function listGithubAdminRepositories(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubAdminRepository[]> {
  const response = await fetchImpl(GITHUB_REPOS_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "BountyBoard",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new IdentityError(
      401,
      "GitHub repository access was denied. Sign out and sign in again to grant public repository access.",
    );
  }
  if (!response.ok) {
    throw new IdentityError(502, `GitHub returned HTTP ${response.status}`);
  }

  const body = (await response.json().catch(() => null)) as GithubRepositoryResponse[] | null;
  if (!Array.isArray(body)) {
    throw new IdentityError(502, "GitHub returned an invalid repository list");
  }

  return body
    .filter(
      (repository) =>
        repository.private === false &&
        repository.permissions?.admin === true &&
        typeof repository.id === "number" &&
        typeof repository.name === "string" &&
        typeof repository.full_name === "string" &&
        typeof repository.default_branch === "string" &&
        typeof repository.html_url === "string" &&
        typeof repository.owner?.login === "string",
    )
    .map((repository) => ({
      id: repository.id as number,
      owner: repository.owner?.login as string,
      name: repository.name as string,
      fullName: repository.full_name as string,
      defaultBranch: repository.default_branch as string,
      htmlUrl: repository.html_url as string,
    }));
}
