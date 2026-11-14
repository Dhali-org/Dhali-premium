// A minimal premium endpoint. Register https://<host>/premium as the API's
// base URL in app.dhali.io.

import express from "express";
import { requireDhali } from "./require-dhali.js";

const app = express();

app.use("/premium", requireDhali());

// Returned as an HTML fragment: <dhali-premium> inserts it into your page,
// where your own CSS styles it.
app.get("/premium/articles/:id", (req, res) => {
  res.type("html").send(`<article><h3>Article ${Number(req.params.id)}</h3><p>The full text…</p></article>`);
});

// format="json": the page fills a <template> or handles the dhali:unlocked event.
app.get("/premium/prices/:symbol", (req, res) => {
  res.json({ symbol: req.params.symbol, price: 2.31, updated: new Date().toISOString() });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Premium endpoint on http://localhost:${port}/premium`));
