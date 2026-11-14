// Partner endpoints must refuse requests that didn't come through Dhali.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createPartnerBackend } from "../examples/ledgerlight/backend/server.mjs";
import { requireDhali } from "../examples/express/require-dhali.js";
import { close, listen } from "./helpers.mjs";

let backend, base;
before(async () => {
  backend = createPartnerBackend({ secretHeader: "X-Partner-Secret", secret: "s3cret" });
  base = await listen(backend);
});
after(() => close(backend));

test("ledgerlight: 403 without the header secret", async () => {
  const res = await fetch(`${base}/reports/rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De/RLUSD`);
  assert.equal(res.status, 403);
});

test("ledgerlight: 403 with the wrong secret", async () => {
  const res = await fetch(`${base}/reports/x/y`, { headers: { "x-partner-secret": "s3creT" } });
  assert.equal(res.status, 403);
});

test("ledgerlight: with the secret, bad input is rejected before any ledger call", async () => {
  const res = await fetch(`${base}/reports/not-an-address/RLUSD`, { headers: { "x-partner-secret": "s3cret" } });
  assert.equal(res.status, 400);
});

test("ledgerlight: refuses to start without a secret", () => {
  assert.throws(() => createPartnerBackend({ secretHeader: "x", secret: "" }));
});

function runMiddleware(mw, headers) {
  let status = 200;
  let passed = false;
  const req = { get: (h) => headers[h.toLowerCase()] };
  const res = { status: (s) => ((status = s), res), send: () => res };
  mw(req, res, () => (passed = true));
  return { status, passed };
}

test("express middleware: passes only with the exact secret", () => {
  const mw = requireDhali({ secret: "s3cret" });
  assert.deepEqual(runMiddleware(mw, { "x-partner-secret": "s3cret" }), { status: 200, passed: true });
  assert.deepEqual(runMiddleware(mw, { "x-partner-secret": "s3cre" }), { status: 403, passed: false });
  assert.deepEqual(runMiddleware(mw, {}), { status: 403, passed: false });
});

test("express middleware: custom header name", () => {
  const mw = requireDhali({ header: "x-dhali", secret: "abc" });
  assert.equal(runMiddleware(mw, { "x-dhali": "abc" }).passed, true);
  assert.equal(runMiddleware(mw, { "x-partner-secret": "abc" }).passed, false);
});

test("express middleware: refuses to start without a secret", () => {
  assert.throws(() => requireDhali({ secret: "" }));
});
