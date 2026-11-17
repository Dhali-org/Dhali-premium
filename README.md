# Dhali Premium Sections

Sell individual sections of your website for crypto. Visitors pay from their own wallet in a click, with no account or subscription. You don't run any payment code.

Supported currencies include XRP on the XRP Ledger, XAH on Xahau, and USDC, RLUSD and ETH on Ethereum.

```html
<dhali-premium api="YOUR-API-ID" path="/reports/rlusd">
  <p>Preview: RLUSD has 3 issuer controls. Unlock the full report.</p>
</dhali-premium>
```

Visitors see your teaser and an **Unlock · 0.05 XRP** button, priced in whichever currency you choose. After they pay, your premium content replaces the teaser, styled by your own CSS.

## How it works

1. You put your premium content behind a URL and register it with [Dhali](https://app.dhali.io), setting a price and currency.
2. You wrap a teaser in a `<dhali-premium>` tag on your page.
3. A visitor clicks **Unlock** and approves the payment in the Dhali wallet. The first time, this opens a popup; after that it's one click.
4. Dhali takes the payment, fetches your content and shows it on the page. You're paid for every unlock.

More detail: [How it works](docs/how-it-works.md).

## Get started

### 1. Serve your premium content

Put your premium content at a URL, as an HTML fragment (or JSON). One URL can serve many sections, one per path:

```
https://premium.your-site.example/reports/rlusd   →   <section>…full report…</section>
```

Make it accept only requests from Dhali, so nobody can skip payment. Dhali adds a secret header to every request; refuse requests without it. Pick a ready-made example:

| You have | Use |
|---|---|
| Static HTML files, no server | [Cloudflare Worker](examples/cloudflare-worker/) |
| A Node.js app | [Express](examples/express/) |
| A Python app | [FastAPI](examples/fastapi/) |

### 2. Register it with Dhali

1. Open [app.dhali.io](https://app.dhali.io) and link your wallet. Your earnings go here.
2. Go to **My Assets** → **Create**, open the new API and click **Edit**.
3. Set the **API base URL** (your URL from step 1), the pricing (currency and price per unlock), and an **API header** (a name and a long random value, e.g. from `openssl rand -hex 32`).
4. Save, and copy the API's ID from its endpoint URL: `https://run.api.dhali.io/<api-id>`.

### 3. Add it to your page

Add the script once, then one element per premium section:

```html
<script src="https://cdn.jsdelivr.net/npm/dhali-premium@1.2.0/releases/v1.0.0/premium.js"
        integrity="sha384-eIiADuK4VnchTIWmxyyl8HWjzB/woYmitFYvfXAiX1RKMQQStC+Gvt0mbh0vkaLD"
        crossorigin="anonymous" type="module" async></script>

<dhali-premium api="YOUR-API-ID" path="/reports/rlusd">
  <p>Teaser shown before unlocking…</p>
</dhali-premium>
```

That's it. To change the button text, use JSON responses, react to unlocks or style the content, see the [reference](docs/reference.md).

## Try it locally

With Node.js 20+:

```sh
npm run dev
```

Open http://localhost:4000 and click **Unlock report**. This runs the [Ledgerlight example](examples/ledgerlight/) site against a local stand-in for Dhali, so you don't need a real wallet or funds.

## Pricing

- You set the price per unlock. Each unlock also carries a small compute fee.
- Visitors approve a small budget, slightly more than one unlock, and later unlocks draw from it. When it runs out, the button asks them to top up.

## Security

- **Your page never handles payments.** The payment approval stays inside a Dhali frame, so no script on your page can spend it or trigger a payment.
- **The script is small, public and pinned.** The `integrity` hash stops the browser running it if it ever changes. [Read the source](src/premium.js).
- **Your content only goes to paying visitors**, because your URL refuses requests without Dhali's secret header.

More detail: [How it works](docs/how-it-works.md#security).

## FAQ

**Do my visitors need a Dhali account?**
No, just a crypto wallet that holds the currency you charge in. The Dhali wallet guides them through the rest.

**Do I handle payments, keys or webhooks?**
No. Dhali checks every payment before your content is fetched.

**Can I charge different prices for different sections?**
Every section on one API has the same price. Create a separate API for each price.

**Will search engines see my premium content?**
No, only the teaser. Write it with that in mind.

**Does it work with React, Vue and other frameworks?**
Yes. It's a standard HTML element, so it works anywhere you can add HTML and a script tag.

---

[Reference](docs/reference.md) · [How it works](docs/how-it-works.md) · [Examples](examples/) · [Changelog](CHANGELOG.md) · [Maintainers](docs/maintainers.md)
