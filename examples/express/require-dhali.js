// Express middleware: only serve requests forwarded by the Dhali proxy.
//
//   app.use("/premium", requireDhali());
//
// Set DHALI_SECRET to the header secret you configured in app.dhali.io.

import { timingSafeEqual } from "node:crypto";

export function requireDhali({
  header = "x-partner-secret",
  secret = process.env.DHALI_SECRET,
} = {}) {
  if (!secret) throw new Error("DHALI_SECRET is not set");
  const want = Buffer.from(secret);
  return (req, res, next) => {
    const got = Buffer.from(req.get(header) ?? "");
    if (got.length === want.length && timingSafeEqual(got, want)) return next();
    res.status(403).send("Forbidden");
  };
}
