import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KOSIT_PINS } from "../server/integrations/kosit-pins.js";

/** Where the pinned KoSIT artifacts live locally; git-ignored (ADR-078). */
export const VENDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vendor", "kosit");
export const CONFIGURATION_DIR = path.join(VENDOR, "configuration");
export const SCENARIOS = path.join(CONFIGURATION_DIR, "scenarios.xml");
export const ARTIFACTS = [KOSIT_PINS.validator, KOSIT_PINS.configuration];

export const artifactPath = (artifact) => path.join(VENDOR, artifact.file);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Present and exactly the pinned bytes. */
export const verified = (artifact) =>
  existsSync(artifactPath(artifact)) && sha256(readFileSync(artifactPath(artifact))) === artifact.sha256;
