// Writes the files pay.dhali.io serves under /premium/ into a directory:
//
//   <out>/relay.html, relay.css, relay.js
//   <out>/config.js                  endpoints for the chosen environment
//   <out>/v<version>/premium.js      every frozen release (releases/)
//
// Used by the dhali-premium command (bin/) and by npm run build.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { ENVIRONMENTS, RELAY_FILES, RELEASES, SOURCE, relayConfig, releases } from "./release.mjs";

const OWN_FILES = new Set([...RELAY_FILES, "config.js"]);
const isOwn = (name) => OWN_FILES.has(name) || /^v\d+\.\d+\.\d+$/.test(name);

export function install(outDir, env = "prod") {
  if (!ENVIRONMENTS[env]) {
    throw new Error(`Unknown environment "${env}". Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}`);
  }
  const out = resolve(outDir);
  // Never clear the working directory or anything above it.
  const up = relative(out, process.cwd());
  if (up !== ".." && !up.startsWith(`..${sep}`) && !isAbsolute(up)) {
    throw new Error(`Refusing to install into ${out}: it contains the current directory`);
  }
  // Replace a previous install, but only if the directory holds nothing else.
  if (existsSync(out)) {
    const foreign = readdirSync(out).filter((name) => !isOwn(name));
    if (foreign.length) {
      throw new Error(`Refusing to install into ${out}: it contains files this installer didn't write (${foreign.slice(0, 5).join(", ")}). Use an empty or new directory.`);
    }
    for (const name of readdirSync(out)) rmSync(join(out, name), { recursive: true, force: true });
  }
  mkdirSync(out, { recursive: true });
  for (const f of RELAY_FILES) cpSync(join(SOURCE.relay, f), join(out, f));
  writeFileSync(join(out, "config.js"), relayConfig(env));
  const versions = releases();
  for (const v of versions) {
    mkdirSync(join(out, v), { recursive: true });
    cpSync(join(RELEASES, v, "premium.js"), join(out, v, "premium.js"));
  }
  return { out, env, files: [...RELAY_FILES, "config.js"], versions };
}
