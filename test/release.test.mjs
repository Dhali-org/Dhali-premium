// The published snippet must match the code it loads.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  ENVIRONMENTS, PREMIUM_PATH, cdnUrl, RELAY_FILES, RELEASES, ROOT, SOURCE, VERSION,
  integrity, recordedHashes, relayConfig, relayCsp, releases,
} from "../scripts/release.mjs";

test("CDN URL names the package version and the frozen premium.js", () => {
  assert.equal(cdnUrl("jsdelivr", "1.0.0", "1.2.3"), "https://cdn.jsdelivr.net/npm/dhali-premium@1.2.3/releases/v1.0.0/premium.js");
  assert.equal(cdnUrl("unpkg", "1.0.0", "1.2.3"), "https://unpkg.com/dhali-premium@1.2.3/releases/v1.0.0/premium.js");
  assert.ok(cdnUrl().endsWith(`/releases/v${VERSION}/premium.js`));
});

test("README snippet pins the current version and its integrity hash", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes(cdnUrl()), `README should load ${cdnUrl()}: run \`npm run snippet\``);
  assert.ok(readme.includes(integrity()), "README integrity hash is stale: run `npm run snippet`");
});

test("relay config: prod and staging endpoints, wallet on the relay's own origin", () => {
  assert.equal(ENVIRONMENTS.prod.proxyUrl, "https://run.api.dhali.io");
  assert.equal(ENVIRONMENTS.prod.metadataUrl, "https://get.api.dhali.io");
  for (const [env, cfg] of Object.entries(ENVIRONMENTS)) {
    assert.equal(cfg.walletUrl, "/", `${env}: staging and beta must open their own wallet, not pay.dhali.io`);
    const config = relayConfig(env);
    for (const url of [cfg.proxyUrl, cfg.metadataUrl]) assert.ok(config.includes(url), `${env} config.js should use ${url}`);
  }
  assert.ok(!relayConfig("staging").includes("dhali.io\""), "staging config must not use production endpoints");
});

test("relay CSP allows only its own files and the environment's endpoints", () => {
  for (const [env, cfg] of Object.entries(ENVIRONMENTS)) {
    const csp = relayCsp(env);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!csp.includes("unsafe-"), `${env}: no unsafe-* sources`);
    assert.ok(!csp.includes("frame-ancestors"), `${env}: partners must be able to frame the relay`);
    assert.ok(csp.includes(`connect-src ${new URL(cfg.proxyUrl).origin} ${new URL(cfg.metadataUrl).origin}`));
  }
  const html = readFileSync(join(ROOT, "src/relay/relay.html"), "utf8");
  assert.ok(!/<style|style=|<script>/.test(html), "relay.html must have no inline styles or scripts");
});

test("src/premium.js is frozen as the current release", () => {
  const frozen = join(RELEASES, `v${VERSION}`, "premium.js");
  assert.ok(existsSync(frozen), `releases/v${VERSION}/premium.js is missing: run \`npm run freeze\``);
  assert.ok(readFileSync(frozen).equals(readFileSync(SOURCE.premium)), "src/premium.js differs from its frozen copy: run `npm run freeze`");
});

test("published releases never change", () => {
  const recorded = recordedHashes();
  for (const v of releases()) {
    assert.equal(integrity(join(RELEASES, v, "premium.js")), recorded[v], `releases/${v}/premium.js no longer matches its recorded hash`);
  }
  assert.deepEqual(Object.keys(recorded).sort(), releases(), "releases/integrity.json and releases/ disagree");
});

test("dhali-premium install writes /premium/ for an environment", () => {
  const out = mkdtempSync(join(tmpdir(), "dhali-premium-"));
  try {
    execFileSync(process.execPath, [join(ROOT, "bin/dhali-premium.mjs"), "install", out, "--env", "staging"], { stdio: "ignore" });
    for (const f of [...RELAY_FILES, "config.js"]) assert.ok(existsSync(join(out, f)), f);
    for (const v of releases()) assert.ok(existsSync(join(out, v, "premium.js")), `${v}/premium.js`);
    const config = readFileSync(join(out, "config.js"), "utf8");
    assert.ok(config.includes(ENVIRONMENTS.staging.proxyUrl), "staging config");
    assert.ok(!config.includes(ENVIRONMENTS.prod.proxyUrl), "no prod endpoints in staging");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("dhali-premium install replaces its own files but nothing else", () => {
  const out = mkdtempSync(join(tmpdir(), "dhali-premium-"));
  const run = (dir) =>
    execFileSync(process.execPath, [join(ROOT, "bin/dhali-premium.mjs"), "install", dir], { stdio: "ignore", cwd: tmpdir() });
  try {
    run(out);
    run(out); // reinstalling over a previous install is fine
    assert.ok(existsSync(join(out, "relay.html")));
    writeFileSync(join(out, "index.html"), "not ours");
    assert.throws(() => run(out), "refuses a directory with other files");
    assert.ok(existsSync(join(out, "index.html")), "other files are left alone");
    assert.ok(existsSync(join(out, "relay.html")), "nothing is removed when refusing");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("dhali-premium install refuses the current directory and its parents", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dhali-premium-"));
  try {
    for (const dir of [".", ".."]) {
      assert.throws(() =>
        execFileSync(process.execPath, [join(ROOT, "bin/dhali-premium.mjs"), "install", dir], { stdio: "ignore", cwd })
      );
    }
    assert.ok(existsSync(cwd));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dhali-premium install rejects an unknown environment", () => {
  const out = mkdtempSync(join(tmpdir(), "dhali-premium-"));
  try {
    assert.throws(() =>
      execFileSync(process.execPath, [join(ROOT, "bin/dhali-premium.mjs"), "install", out, "--env", "nope"], { stdio: "ignore" })
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
