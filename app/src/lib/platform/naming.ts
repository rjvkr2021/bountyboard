export const MIN_REPO_SLUG_LENGTH = 3;
export const MAX_REPO_SLUG_LENGTH = 32;
export const MAX_NEAR_ACCOUNT_ID_LENGTH = 64;

export type SlugValidation =
  | { valid: true }
  | { valid: false; reason: "length" | "format" };

export function validateRepoSlug(slug: string): SlugValidation {
  if (slug.length < MIN_REPO_SLUG_LENGTH || slug.length > MAX_REPO_SLUG_LENGTH) {
    return { valid: false, reason: "length" };
  }

  if (!/^[a-z0-9-]+$/.test(slug) || slug.startsWith("-") || slug.endsWith("-")) {
    return { valid: false, reason: "format" };
  }

  return { valid: true };
}

export function isRepoSlug(slug: string): slug is string {
  return validateRepoSlug(slug).valid;
}

export interface PlatformAccountNames {
  dao: string;
  board: string;
  oracle: string;
}

export function platformAccountNames(
  slug: string,
  root: string,
): PlatformAccountNames {
  if (!isRepoSlug(slug)) {
    throw new Error(`Invalid repo slug: ${slug}`);
  }

  if (!root || root.length > MAX_NEAR_ACCOUNT_ID_LENGTH) {
    throw new Error(`Invalid platform root account: ${root}`);
  }

  const names: PlatformAccountNames = {
    dao: `${slug}-dao.${root}`,
    board: `${slug}-board.${root}`,
    oracle: `${slug}-oracle.${root}`,
  };

  for (const [kind, accountId] of Object.entries(names)) {
    if (accountId.length > MAX_NEAR_ACCOUNT_ID_LENGTH) {
      throw new Error(
        `${kind} account id exceeds ${MAX_NEAR_ACCOUNT_ID_LENGTH} characters: ${accountId}`,
      );
    }
  }

  return names;
}

export function slugFromRepoName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_REPO_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return isRepoSlug(slug) ? slug : null;
}
