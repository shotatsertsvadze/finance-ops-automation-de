import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { ARTIFACTS, CONFIGURATION_DIR, SCENARIOS, artifactPath, verified } from "./kosit-files.js";
import { KOSIT_PINS } from "../server/integrations/kosit-pins.js";

/**
 * `npm run kosit`: starts the pinned KoSIT daemon for local development and
 * CI, on 127.0.0.1 only; the daemon has no authentication (ADR-078). The Java
 * binary is KOSIT_JAVA, or `java` on the PATH; nothing is installed or linked.
 */
const LOOPBACK = "127.0.0.1";

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The major version `java -version` reports (on stderr), or null. */
function javaMajor(java) {
  const { stderr, error } = spawnSync(java, ["-version"], { encoding: "utf8" });
  if (error) return null;
  return Number(/version "(?:1\.)?(\d+)/.exec(stderr)?.[1]) || null;
}

const url = new URL(process.env.KOSIT_URL ?? `http://${LOOPBACK}:8081`);
if (![LOOPBACK, "localhost"].includes(url.hostname)) {
  fail(`KOSIT_URL zeigt auf ${url.hostname}; npm run kosit startet nur lokal auf ${LOOPBACK}`);
}
for (const artifact of ARTIFACTS) {
  if (!verified(artifact)) fail(`${artifact.file} fehlt oder weicht vom gepinnten SHA-256 ab: zuerst npm run kosit:fetch`);
}
if (!existsSync(SCENARIOS)) fail("Konfiguration nicht entpackt: zuerst npm run kosit:fetch");

const java = process.env.KOSIT_JAVA ?? "java";
const major = javaMajor(java);
if (!major) fail(`Kein lauffähiges Java unter "${java}": KOSIT_JAVA auf ein Java ab Version 11 setzen`);
if (major < 11) fail(`Java ${major} unter "${java}" ist zu alt: der Validator braucht Java 11 oder neuer`);

const port = url.port || "8081";
console.log(`KoSIT ${KOSIT_PINS.validator.version} mit ${KOSIT_PINS.configuration.version} auf http://${LOOPBACK}:${port} (Java ${major})`);
const daemon = spawn(java, [
  "-jar", artifactPath(KOSIT_PINS.validator), "-s", SCENARIOS, "-r", CONFIGURATION_DIR,
  "-D", "-H", LOOPBACK, "-P", port, "-G",
], { stdio: "inherit" });
daemon.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => daemon.kill(signal));
