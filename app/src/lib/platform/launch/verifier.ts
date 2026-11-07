import type { GithubRepoAdmin } from "../github-admin";

export interface GithubVerificationInput {
  owner: string;
  repo: string;
  token?: string;
}

export interface GithubVerifier {
  verify(input: GithubVerificationInput): Promise<GithubRepoAdmin>;
}

export class GithubAdminVerifier implements GithubVerifier {
  async verify(input: GithubVerificationInput): Promise<GithubRepoAdmin> {
    if (!input.token) {
      throw new Error("A GitHub token with admin access is required");
    }
    const { verifyGithubRepoAdmin } = await import("../github-admin");
    return verifyGithubRepoAdmin({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
    });
  }
}
