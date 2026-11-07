import { NextResponse } from "next/server";

export function platformError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function handlePlatformError(error: unknown) {
  if (error instanceof Error && typeof (error as Error & { status?: unknown }).status === "number") {
    return platformError((error as Error & { status: number }).status, error.message);
  }
  const message = error instanceof Error ? error.message : "Platform request failed";
  const status = /not found/i.test(message) ? 404 : /already|required|invalid|must|greater|reserved|only public|private repositor|link a near account|does not exist/i.test(message) ? 400 : 500;
  return platformError(status, message);
}
