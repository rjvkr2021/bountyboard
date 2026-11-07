import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AppSession = typeof auth.$Infer.Session;

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly name = "AuthError";

  constructor(message = "Sign in to continue") {
    super(message);
  }
}

export async function getSession(): Promise<AppSession | null> {
  return auth.api.getSession({ headers: await headers() });
}

export async function getOptionalSession(): Promise<AppSession | null> {
  try {
    return await getSession();
  } catch (error) {
    console.error("Could not read the current session:", error);
    return null;
  }
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) throw new AuthenticationError();
  return session;
}
