// Checks that the public CDNs serve every frozen premium.js, from the
// published package, byte for byte: each file's hash must match
// releases/integrity.json. Partners' integrity attributes depend on it.
//
//   npm run verify:cdn                 # the version in package.json
//   npm run verify:cdn -- 1.2.0        # another published package version
//
// A just-published version can take a minute to reach the CDNs, so failed
// fetches are retried for up to RETRY_SECONDS (default 300).

import { createHash } from "node:crypto";
import { CDNS, PACKAGE_VERSION, cdnUrl, recordedHashes } from "./release.mjs";

const pkgVersion = process.argv[2] ?? PACKAGE_VERSION;
const deadline = Date.now() + Number(process.env.RETRY_SECONDS ?? 300) * 1000;

async function fetchHash(url) {
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = Buffer.from(await res.arrayBuffer());
        return { hash: "sha384-" + createHash("sha384").update(body).digest("base64"), cors: res.headers.get("access-control-allow-origin") };
      }
      if (Date.now() > deadline) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (Date.now() > deadline) throw err;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

let failed = 0;
for (const [release, expected] of Object.entries(recordedHashes())) {
  for (const cdn of Object.keys(CDNS)) {
    const url = cdnUrl(cdn, release.slice(1), pkgVersion);
    try {
      const { hash, cors } = await fetchHash(url);
      const problems = [hash !== expected && `hash ${hash}, expected ${expected}`, cors !== "*" && `Access-Control-Allow-Origin ${cors}`].filter(Boolean);
      if (problems.length) failed++;
      console.log(`${problems.length ? "FAIL" : "ok  "} ${url}${problems.length ? ": " + problems.join("; ") : ""}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${url}: ${err.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
