// The partner's premium endpoint: the "base URL" registered with Dhali.
// It answers only requests forwarded by the Dhali proxy, which adds the
// header secret configured for the API in app.dhali.io.

import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { isAddress, reportHtml, tokenReport } from "./xrpl.mjs";

const CACHE_MS = 60_000;

const cache = new Map();

const sameSecret = (got, want) => {
  const a = Buffer.from(String(got ?? ""));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function cachedReport(issuer, currency) {
  const key = `${issuer}:${currency}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;
  const report = await tokenReport(issuer, currency);
  cache.set(key, { at: Date.now(), report });
  return report;
}

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  res.end(body);
}

export function createPartnerBackend({ secretHeader, secret }) {
  if (!secret) throw new Error("A header secret is required");
  const header = secretHeader.toLowerCase();
  return http.createServer(async (req, res) => {
    if (!sameSecret(req.headers[header], secret)) {
      return send(res, 403, "text/plain", "Forbidden: premium content is only available through Dhali.");
    }
    const url = new URL(req.url, "http://partner");
    const m = /^\/reports\/([^/]+)\/([^/]+?)(\.json)?$/.exec(url.pathname);
    if (req.method !== "GET" || !m) return send(res, 404, "text/plain", "Not found");

    const issuer = decodeURIComponent(m[1]);
    const currency = decodeURIComponent(m[2]);
    if (!isAddress(issuer)) return send(res, 400, "text/plain", "Invalid issuer address");

    try {
      const report = await cachedReport(issuer, currency);
      if (m[3]) return send(res, 200, "application/json", JSON.stringify(report));
      return send(res, 200, "text/html", reportHtml(report));
    } catch (e) {
      if (e.message === "Invalid currency code") return send(res, 400, "text/plain", e.message);
      const status = e.code === "actNotFound" ? 404 : 502;
      return send(res, status, "text/plain", e.code === "actNotFound" ? "Issuer account not found" : "Ledger lookup failed");
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4003);
  const secretHeader = process.env.PARTNER_SECRET_HEADER || "x-partner-secret";
  createPartnerBackend({ secretHeader, secret: process.env.PARTNER_SECRET }).listen(port, () =>
    console.log(`partner backend on http://localhost:${port} (expects ${secretHeader})`)
  );
}
