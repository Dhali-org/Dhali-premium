// Runs the whole flow locally on four origins:
//
//   http://localhost:4000   partner site (the page with <dhali-premium>)
//   http://127.0.0.1:4001   stand-in for pay.dhali.io (relay, premium.js, mock wallet)
//   http://127.0.0.1:4002   stand-in for run.api.dhali.io / get.api.dhali.io
//   http://localhost:4003   partner backend (the API's base URL)
//
// localhost and 127.0.0.1 are different sites, so the relay iframe is
// cross-site to the partner page and its storage is partitioned, as in production.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createMockDhali } from "./mock-dhali.mjs";
import { createPartnerBackend } from "../examples/ledgerlight/backend/server.mjs";
import { PREMIUM_PATH, ROOT, SOURCE, integrity, relayCsp } from "../scripts/release.mjs";

const PARTNER = "http://localhost:4000";
const PAY = "http://127.0.0.1:4001";
const DHALI = "http://127.0.0.1:4002";
const BACKEND = "http://localhost:4003";

const API_UUID = "0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8";
const SECRET_HEADER = "x-partner-secret";
const SECRET = process.env.PARTNER_SECRET || "dev-secret-change-me";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function serveFile(res, file, extraHeaders = {}) {
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", ...extraHeaders });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

function safeJoin(base, urlPath) {
  const p = normalize(join(base, decodeURIComponent(urlPath)));
  return p.startsWith(base) ? p : null;
}

// --- pay.dhali.io stand-in -------------------------------------------------
const devRelayConfig = {
  walletUrl: `${PAY}/mock-wallet/`,
  proxyUrl: `${DHALI}/run`,
  metadataUrl: `${DHALI}/get`,
  devChannelsUrl: `${DHALI}/dev/channels`,
};
const devConfig = `window.DHALI_RELAY_CONFIG = ${JSON.stringify(devRelayConfig)};\n`;

const pay = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, PAY);
  if (pathname === "/premium/config.js") {
    res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" });
    return res.end(devConfig);
  }
  if (pathname === PREMIUM_PATH) {
    // premium.js is loaded cross-origin with an integrity hash, which needs CORS.
    return serveFile(res, SOURCE.premium, { "access-control-allow-origin": "*" });
  }
  if (pathname === "/premium/relay.html") {
    // Same CSP as production, with the sandbox endpoints.
    return serveFile(res, join(SOURCE.relay, "relay.html"), {
      "content-security-policy": relayCsp("dev", devRelayConfig),
    });
  }
  if (pathname.startsWith("/premium/")) {
    return serveFile(res, safeJoin(SOURCE.relay, pathname.slice("/premium".length)));
  }
  if (pathname === "/mock-wallet/" || pathname === "/") {
    return serveFile(res, join(ROOT, "dev/mock-wallet.html"));
  }
  res.writeHead(404).end();
});

// --- partner site ----------------------------------------------------------
const partner = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, PARTNER);
  if (pathname !== "/") return res.writeHead(404).end();
  const html = (await readFile(join(ROOT, "examples/ledgerlight/site/index.html"), "utf8"))
    .replaceAll("{{RELAY_ORIGIN}}", PAY)
    .replaceAll("{{PREMIUM_SRC}}", PAY + PREMIUM_PATH)
    .replaceAll("{{PREMIUM_SRI}}", integrity()) // recomputed per request so edits take effect
    .replaceAll("{{API_UUID}}", API_UUID);
  res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
  res.end(html);
});

// --- Dhali proxy stand-in and partner backend ---------------------------------
const dhali = createMockDhali({
  [API_UUID]: {
    name: "ledgerlight-token-reports",
    rate: 50_000, // drops per request = 0.05 XRP
    baseUrl: BACKEND,
    headers: { [SECRET_HEADER]: SECRET },
  },
});
const backend = createPartnerBackend({ secretHeader: SECRET_HEADER, secret: SECRET });

const listen = (server, url) =>
  new Promise((ok) => {
    const u = new URL(url);
    server.listen(Number(u.port), u.hostname, ok);
  });

await Promise.all([
  listen(partner, PARTNER),
  listen(pay, PAY),
  listen(dhali, DHALI),
  listen(backend, BACKEND),
]);

console.log(`
  Partner site           ${PARTNER}
  pay.dhali.io (mock)    ${PAY}/mock-wallet/
  Dhali proxy (mock)     ${DHALI}/run/${API_UUID}/…
  Partner backend        ${BACKEND}  (requires ${SECRET_HEADER})

  Open ${PARTNER} and click "Unlock report".
`);
