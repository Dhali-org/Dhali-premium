// The local stand-in for run.api.dhali.io must behave like the real proxy,
// or the sandbox tells partners the wrong story.

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { createMockDhali } from "../dev/mock-dhali.mjs";
import { claim, close, listen } from "./helpers.mjs";

const API = "11111111-2222-4333-8444-555555555555";
const RATE = 50_000;
let upstream, dhali, base, seen;

before(async () => {
  upstream = http.createServer((req, res) => {
    seen = { url: req.url, secret: req.headers["x-partner-secret"], claim: req.headers["payment-claim"] };
    if (req.url.startsWith("/fail")) return res.writeHead(500).end();
    res.writeHead(200, { "content-type": "text/html" }).end("<p>premium</p>");
  });
  const upstreamUrl = await listen(upstream);
  dhali = createMockDhali({
    [API]: { name: "test", rate: RATE, baseUrl: upstreamUrl, headers: { "x-partner-secret": "s3cret" } },
  });
  base = await listen(dhali);
});

after(async () => {
  await close(dhali);
  await close(upstream);
});

test("metadata gives the price", async () => {
  const meta = await (await fetch(`${base}/get/${API}`)).json();
  assert.equal(meta.asset_earning_rate, RATE);
  assert.equal(meta.asset_earning_currency.code, "XRP");
});

test("no claim: 402 HTML", async () => {
  const res = await fetch(`${base}/run/${API}/x`);
  assert.equal(res.status, 402);
  assert.match(res.headers.get("content-type"), /text\/html/);
});

test("unparseable claim: 402 JSON", async () => {
  const res = await fetch(`${base}/run/${API}/x`, { headers: { "payment-claim": "nope" } });
  assert.equal(res.status, 402);
  assert.match((await res.json()).detail, /can be parsed/);
});

test("claim below the worst case: 402 JSON with both amounts", async () => {
  const res = await fetch(`${base}/run/${API}/x`, { headers: { "payment-claim": claim(RATE, "short") } });
  assert.equal(res.status, 402);
  const { detail } = await res.json();
  assert.match(detail, new RegExp(`authorized to pull ${RATE}\\b`));
  assert.match(detail, /COULD consume as much as\s+\d+/);
});

test("valid claim: forwards with the header secret, not the claim, and reports the charge", async () => {
  const res = await fetch(`${base}/run/${API}/reports/a?b=1`, { headers: { "payment-claim": claim(1_000_000, "ok") } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<p>premium</p>");
  assert.deepEqual(seen, { url: "/reports/a?b=1", secret: "s3cret", claim: undefined });
  assert.ok(Number(res.headers.get("dhali-latest-request-charge")) >= RATE);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("upstream error becomes a 500", async () => {
  const res = await fetch(`${base}/run/${API}/fail`, { headers: { "payment-claim": claim(1_000_000, "err") } });
  assert.equal(res.status, 500);
});

test("CORS preflight allows Payment-Claim", async () => {
  const res = await fetch(`${base}/run/${API}/x`, { method: "OPTIONS" });
  assert.match(res.headers.get("access-control-allow-headers"), /payment-claim/i);
});
