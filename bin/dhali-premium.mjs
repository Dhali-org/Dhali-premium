#!/usr/bin/env node
// dhali-premium install <dir> [--env prod|staging]
//
// Writes the Premium Sections files into <dir>, which pay.dhali.io serves as
// /premium/. The wallet runs this before `flutter build web`, with <dir> set
// to web/premium.

import { install } from "../scripts/install.mjs";

const [command, dir, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (command !== "install" || !dir) {
  console.error("Usage: dhali-premium install <dir> [--env prod|staging]");
  process.exit(2);
}

try {
  const { out, env, files, versions } = install(dir, flag("env") || "prod");
  console.log(`Installed Premium Sections (${env}) into ${out}
  ${files.join(", ")}
  ${versions.map((v) => `${v}/premium.js`).join(", ")}`);
} catch (e) {
  console.error(`dhali-premium: ${e.message}`);
  process.exit(1);
}
