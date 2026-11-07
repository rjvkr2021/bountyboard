const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

export type GithubAdminErrorCode =
  | "unauthorized"
  | "not_found"
  | "not_admin"
  | "github_error"
  | "malformed";

export class GithubAdminError extends Error {
  constructor(
    public readonly code: GithubAdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GithubAdminError";
  }
}

export interface GithubRepoAdmin {
  repoId: number;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  viewerId: number;
  viewerLogin: string;
  viewerPermission: "ADMIN";
}

export interface VerifyGithubRepoAdminInput {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}

const REPO_ADMIN_QUERY = `query RepoAdmin($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    databaseId
    nameWithOwner
    isPrivate
    viewerPermission
    defaultBranchRef { name }
  }
  viewer { login databaseId }
}`;

interface GraphqlResponse {
  data?: {
    repository?: {
      databaseId?: number | null;
      nameWithOwner?: string | null;
      isPrivate?: boolean | null;
      viewerPermission?: string | null;
      defaultBranchRef?: { name?: string | null } | null;
    } | null;
    viewer?: { login?: string | null; databaseId?: number | null } | null;
  };
  errors?: Array<{ type?: string; message?: string }>;
}

export async function verifyGithubRepoAdmin({
  token,
  owner,
  repo,
  fetchImpl = fetch,
}: VerifyGithubRepoAdminInput): Promise<GithubRepoAdmin> {
  if (!token) {
    throw new GithubAdminError("unauthorized", "Missing GitHub user token");
  }
  if (!owner || !repo || owner.includes("/") || repo.includes("/")) {
    throw new GithubAdminError("malformed", "Invalid GitHub owner or repo name");
  }

  const response = await fetchImpl(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query: REPO_ADMIN_QUERY,
      variables: { owner, name: repo },
    }),
  });

  if (response.status === 401) {
    throw new GithubAdminError("unauthorized", "GitHub token was rejected");
  }
  if (response.status === 403) {
    throw new GithubAdminError("github_error", "GitHub denied the request");
  }
  if (response.status === 404) {
    throw new GithubAdminError("not_found", "GitHub repository was not found");
  }
  if (!response.ok) {
    throw new GithubAdminError(
      "github_error",
      `GitHub returned HTTP ${response.status}`,
    );
  }

  let body: GraphqlResponse;
  try {
    body = (await response.json()) as GraphqlResponse;
  } catch {
    throw new GithubAdminError("malformed", "GitHub returned invalid JSON");
  }

  if (body.errors?.length) {
    if (body.errors.some((error) => error.type === "NOT_FOUND")) {
      throw new GithubAdminError("not_found", "GitHub repository was not found");
    }
    throw new GithubAdminError("github_error", "GitHub GraphQL request failed");
  }

  const repository = body.data?.repository;
  const viewerLogin = body.data?.viewer?.login;
  const viewerId = body.data?.viewer?.databaseId;
  if (!repository || !viewerLogin || typeof viewerId !== "number") {
    throw new GithubAdminError("not_found", "GitHub repository was not found");
  }

  if (repository.viewerPermission !== "ADMIN") {
    throw new GithubAdminError(
      "not_admin",
      "GitHub user does not have admin permission on this repository",
    );
  }

  if (
    typeof repository.databaseId !== "number" ||
    !repository.nameWithOwner ||
    typeof repository.isPrivate !== "boolean" ||
    !repository.defaultBranchRef?.name
  ) {
    throw new GithubAdminError("malformed", "GitHub returned incomplete repo data");
  }

  return {
    repoId: repository.databaseId,
    fullName: repository.nameWithOwner,
    defaultBranch: repository.defaultBranchRef.name,
    isPrivate: repository.isPrivate,
    viewerId,
    viewerLogin,
    viewerPermission: "ADMIN",
  };
}
