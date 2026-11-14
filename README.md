# Dhali Premium Sections

Add premium sections to your website that visitors unlock with XRP, straight from their own wallet. Visitors don't need an account or a subscription, and you don't run any payment code.

```html
<dhali-premium api="YOUR-API-ID" path="/reports/rlusd">
  <p>Preview: RLUSD has 3 issuer controls. Unlock the full report.</p>
</dhali-premium>
```

The visitor sees your teaser and an **Unlock · 0.05 XRP** button. When they click, they approve a payment in the Dhali wallet. Your premium content then replaces the teaser, styled by your own CSS. Later unlocks on your site take one click.

> **Status: pre-release.** The hosted files go live on pay.dhali.io with the next wallet release. Until then, try the whole flow locally with [`npm run dev`](#try-it-locally).

## Contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [The `<dhali-premium>` element](#the-dhali-premium-element)
- [Response formats](#response-formats)
- [Styling](#styling)
- [Events](#events)
- [Pricing](#pricing)
- [Security](#security)
- [Browser support](#browser-support)
- [Try it locally](#try-it-locally)
- [Examples](#examples)
- [FAQ](#faq)

## How it works

1. You register your premium endpoint with [Dhali](https://app.dhali.io) as an API, with a price per request.
2. You wrap a short teaser of your premium content in a `<dhali-premium>` tag. Visitors see the teaser, with an Unlock button added below it.
3. A visitor clicks Unlock. On their first unlock on your site, the Dhali wallet opens in a popup at [pay.dhali.io](https://pay.dhali.io). There they open an XRP payment channel, or reuse one they already have, and authorise Dhali to spend up to an amount from it.
4. Dhali checks the payment, fetches the content from your endpoint and hands it to the page.
5. You're paid in XRP for every unlock.

The visitor's payment approval stays inside a Dhali frame and never touches your page. See [how it works](docs/how-it-works.md) for the details.

## Quick start

### 1. Create a premium endpoint

Any URL that returns your premium content works, either as an HTML fragment or as JSON. For example:

```
GET https://premium.your-site.example/reports/rlusd   →   <section>…full report…</section>
```

The part after your base URL is the `path` you'll use on the page. One endpoint can serve any number of sections.

### 2. Protect your endpoint

The Dhali proxy adds a secret header to every request it forwards. Refuse requests without it, so nobody can skip payment by calling your endpoint directly:

```js
// Express. See examples/ for Cloudflare Workers and FastAPI.
import { requireDhali } from "./require-dhali.js";
app.use("/reports", requireDhali());   // 403 unless x-partner-secret matches DHALI_SECRET
```

Pick a header name and a long random value, for example from `openssl rand -hex 32`.

| You have | Use |
|---|---|
| Static HTML files, no server | [Cloudflare Worker](examples/cloudflare-worker/) |
| A Node.js app | [Express middleware](examples/express/) |
| A Python app | [FastAPI dependency](examples/fastapi/) |

### 3. Register it with Dhali

1. Open [app.dhali.io](https://app.dhali.io) and link your XRPL wallet. Your earnings go to this wallet.
2. Go to **My Assets** → **Create**, open the new API and click **Edit**.
3. Set:
   - **Base URL:** your endpoint, e.g. `https://premium.your-site.example`
   - **Pricing:** the XRP charged per unlock
   - **Header secret:** the header name and value from step 2
4. Save, and copy the API's ID from its endpoint URL (`https://run.api.dhali.io/<api-id>`).

Using the [reverse proxy](https://dhali.io/docs/creating-apis/) needs no code changes on your side.

### 4. Add it to your page

Add the script once per page, then one element per premium section:

```html
<script src="https://cdn.jsdelivr.net/npm/dhali-premium@1.0.0/releases/v1.0.0/premium.js"
        integrity="sha384-eIiADuK4VnchTIWmxyyl8HWjzB/woYmitFYvfXAiX1RKMQQStC+Gvt0mbh0vkaLD"
        crossorigin="anonymous" type="module" async></script>

<dhali-premium api="YOUR-API-ID" path="/reports/rlusd">
  <p>Teaser shown before unlocking…</p>
</dhali-premium>
```

Keep the `integrity` attribute. It makes the browser refuse to run the script if the file ever changes.

`premium.js` comes from the [`dhali-premium`](https://www.npmjs.com/package/dhali-premium) npm package, through jsDelivr. The same file is at `https://unpkg.com/dhali-premium@1.0.0/releases/v1.0.0/premium.js`, with the same hash, if you prefer unpkg. If your site has a Content-Security-Policy, allow the CDN in `script-src` and `https://pay.dhali.io` in `frame-src`.

## The `<dhali-premium>` element

| Attribute | Required | Description |
|---|---|---|
| `api` | yes | Your Dhali API's ID. |
| `path` | no | Appended to your base URL. Defaults to `/`. Paths can't leave your API: `..` segments that would reach another API are refused. |
| `format` | no | `html` (default) or `json`. See [Response formats](#response-formats). |
| `label` | no | Button text. Defaults to `Unlock`. The price is added automatically: **Unlock report · 0.05 XRP**. |

- **The element's content is the teaser.** Everyone sees it, including search engines. It's removed when the section unlocks.
- **The price comes from Dhali**, from your API's settings, so it can't drift from what's actually charged.
- **Elements added later work too.** You can create `<dhali-premium>` elements after the page loads, but set `api` and `path` before adding the element to the page.

## Response formats

### `html` (default)

Your endpoint returns an HTML fragment. It replaces the teaser as ordinary page content, so your CSS applies and it looks native.

```html
<dhali-premium api="…" path="/articles/42">
  <p class="teaser">The first paragraph…</p>
</dhali-premium>
```

### `json`

Your endpoint returns JSON. Put a `<template>` inside the element, and `{{field}}` placeholders are filled from the response. Use dots for nested values. Values are HTML-escaped.

```html
<dhali-premium api="…" path="/scores/core.json" format="json" label="Unlock score">
  <p>A one-line verdict with holder and liquidity figures.</p>
  <template>
    <p>Verdict: <b>{{verdict.label}}</b> · Holders: <b>{{stats.holders}}</b></p>
  </template>
</dhali-premium>
```

To render the data yourself, leave out the `<template>` and listen for [`dhali:unlocked`](#events). In that case, the teaser stays until you replace it.

## Styling

- Unlocked content is wrapped in `<div class="dhali-premium-content">` inside the element, and is styled by your page's CSS.
- `dhali-premium` is an ordinary element, so you can give it a margin, a border, or anything else.
- The Unlock button sits in a Dhali frame that sizes itself to its contents. Its look is fixed, so visitors can recognise a real Dhali payment button.

## Events

Both events bubble from the element.

| Event | `event.detail` | When |
|---|---|---|
| `dhali:unlocked` | `{ body, data, charge }` | The section unlocked. `body` is the response text, `data` is the parsed JSON (`format="json"` only), and `charge` is what the visitor paid, e.g. `"0.051187 XRP"`. |
| `dhali:error` | `{ message }` | The unlock failed, for example because your endpoint returned an error. The button shows the message too. |

```js
document.addEventListener("dhali:unlocked", (e) => {
  analytics.track("premium_unlock", { path: e.target.getAttribute("path"), charge: e.detail.charge });
});
```

## Pricing

- You set the price per unlock in app.dhali.io. Dhali charges the visitor's payment channel, and you're paid in XRP.
- Each request also pays for the compute it uses, usually a fraction of a thousandth of an XRP. `charge` in `dhali:unlocked` shows the total.
- Visitors approve a budget, not a single payment. Every unlock is deducted from it until it runs out. Then the button shows how much more is needed and reopens the wallet.
- Dhali checks each approval against a worst-case cost, so visitors need to approve slightly more than one unlock's price.

## Security

- **The payment approval never reaches your page.** It lives in a frame on pay.dhali.io, so scripts on your page, including ads, analytics and compromised dependencies, can't spend it.
- **Every payment needs a click inside the Dhali frame.** Your page can't trigger a payment.
- **`premium.js` is pinned and hashed.** It's about 100 lines with no dependencies, and it's served from the public npm package, so you can [review](src/premium.js) exactly the file you load, or self-host it.
- **Your endpoint answers only Dhali**, thanks to the header secret.

Full details: [docs/how-it-works.md](docs/how-it-works.md).

## Browser support

Current versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. `premium.js` uses custom elements and ES modules.

The first unlock opens the wallet in a popup. If a browser blocks it, the button asks the visitor to allow popups.

## Try it locally

Run the whole flow on your machine with Node.js 20+ and no dependencies:

```sh
npm run dev
```

Open http://localhost:4000 and click **Unlock report**. This runs the [Ledgerlight example](examples/ledgerlight/) with a local stand-in for the Dhali wallet and proxy. The stand-in wallet doesn't need a real wallet or real XRP.

## Examples

| Example | |
|---|---|
| [Ledgerlight](examples/ledgerlight/) | A complete site selling XRPL token risk reports from live ledger data. It uses both formats. |
| [Cloudflare Worker](examples/cloudflare-worker/) | Static premium files, no server. |
| [Express](examples/express/) | Protect routes in a Node.js app. |
| [FastAPI](examples/fastapi/) | Protect routes in a Python app. |

## FAQ

**Do my visitors need a Dhali account?**
No. They need an XRPL wallet. The Dhali wallet walks them through approving a payment.

**Do I handle payments, keys or webhooks?**
No. Dhali checks every payment before your endpoint is called. Your endpoint only checks the header secret.

**Can I use one API for many sections?**
Yes. Use a different `path` for each section. Every section on the API has the same price; use separate APIs for different prices.

**Will search engines see my premium content?**
No. They see the teaser, so write it with that in mind.

**Can I host `premium.js` myself?**
Yes. Download the exact version from pay.dhali.io, serve it from your site, and keep the same `integrity` value. The button frame always comes from pay.dhali.io.

**Does it work in single-page apps?**
Yes. `<dhali-premium>` is a standard custom element, so it works anywhere you can render HTML, including React, Vue and Svelte. Load the script once.

---

Maintaining this package? See [docs/maintainers.md](docs/maintainers.md). Changes are listed in the [CHANGELOG](CHANGELOG.md).
