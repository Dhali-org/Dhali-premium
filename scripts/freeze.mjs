// Freezes src/premium.js as releases/v<version>/premium.js.
//
//   npm run freeze
//
// The version is "premiumJs" in package.json. A frozen release may only be
// overwritten with --force, and only before it has been deployed: once
// partners pin its integrity hash it must never change. The hash is recorded
// in releases/integrity.json, which the tests check every release against. Once it is published, partners pin its
// integrity hash and it must never change: bump the version instead.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RELEASES, RELEASE_HASHES, SOURCE, VERSION, integrity, recordedHashes } from "./release.mjs";

const target = join(RELEASES, `v${VERSION}`, "premium.js");
const force = process.argv.includes("--force");

if (existsSync(target) && !readFileSync(target).equals(readFileSync(SOURCE.premium))) {
  if (!force) {
    console.error(`releases/v${VERSION} is frozen. Bump "premiumJs" in package.json for a new premium.js,
or pass --force if v${VERSION} has never been deployed.`);
    process.exit(1);
  }
}
mkdirSync(join(RELEASES, `v${VERSION}`), { recursive: true });
cpSync(SOURCE.premium, target);
const hashes = { ...recordedHashes(), [`v${VERSION}`]: integrity(target) };
writeFileSync(RELEASE_HASHES, JSON.stringify(hashes, null, 2) + "\n");
console.log(`Froze src/premium.js as releases/v${VERSION}/premium.js`);
