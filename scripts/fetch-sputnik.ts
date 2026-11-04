import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PinnedArtifact {
  version: string;
  commit: string;
  wasmUrl: string;
  sha256: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const versionsPath = join(scriptDir, "versions.json");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function loadPin(): Promise<PinnedArtifact> {
  const raw = await readFile(versionsPath, "utf8");
  const parsed = JSON.parse(raw) as { sputnik?: PinnedArtifact };
  if (!parsed.sputnik) {
    throw new Error(`Missing sputnik pin in ${versionsPath}`);
  }
  return parsed.sputnik;
}

export async function fetchSputnik(
  rootDir = resolve(scriptDir, ".."),
): Promise<string> {
  const pin = await loadPin();
  const cacheDir = join(rootDir, ".cache");
  const target = join(cacheDir, "sputnikdao2.wasm");

  await mkdir(cacheDir, { recursive: true });

  const existing = await readFile(target).catch(() => undefined);
  if (existing && sha256(existing) === pin.sha256) {
    console.log(`Using cached ${target}`);
    return target;
  }

  console.log(`Downloading Sputnik DAO ${pin.version} from ${pin.wasmUrl}`);
  const response = await fetch(pin.wasmUrl);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== pin.sha256) {
    throw new Error(
      `Checksum mismatch for Sputnik DAO wasm: expected ${pin.sha256}, got ${digest}`,
    );
  }

  await writeFile(target, bytes);
  console.log(`Verified Sputnik DAO wasm ${pin.version} (${digest})`);
  return target;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  fetchSputnik().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
