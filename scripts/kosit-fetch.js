import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ARTIFACTS, CONFIGURATION_DIR, SCENARIOS, VENDOR, artifactPath, sha256, verified } from "./kosit-files.js";
import { KOSIT_PINS } from "../server/integrations/kosit-pins.js";

/**
 * `npm run kosit:fetch`: downloads the pinned validator and configuration,
 * refuses anything whose SHA-256 differs, and unpacks the configuration.
 * Artifacts already present with the right hash are kept (ADR-078).
 */
async function fetchArtifact(artifact) {
  if (verified(artifact)) {
    console.log(`vorhanden, SHA-256 geprüft: ${artifact.file}`);
    return;
  }
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${artifact.url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== artifact.sha256) {
    throw new Error(`SHA-256 von ${artifact.file} ist ${actual}, gepinnt ist ${artifact.sha256}; nichts gespeichert`);
  }
  writeFileSync(artifactPath(artifact), bytes);
  console.log(`geladen, SHA-256 geprüft: ${artifact.file}`);
}

async function main() {
  mkdirSync(VENDOR, { recursive: true });
  for (const artifact of ARTIFACTS) await fetchArtifact(artifact);
  // Unpacked afresh from the verified archive, so a stale or edited copy of
  // the rules cannot survive a fetch.
  rmSync(CONFIGURATION_DIR, { recursive: true, force: true });
  execFileSync("unzip", ["-q", artifactPath(KOSIT_PINS.configuration), "-d", CONFIGURATION_DIR]);
  if (!existsSync(SCENARIOS)) throw new Error(`Konfiguration ohne scenarios.xml: ${CONFIGURATION_DIR}`);
  console.log(`KoSIT ${KOSIT_PINS.validator.version} und ${KOSIT_PINS.configuration.version} bereit in ${VENDOR}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
