# Reference

Everything you can configure on a premium section. For setup, see the [README](../README.md).

## The `<dhali-premium>` element

| Attribute | Required | Description |
|---|---|---|
| `api` | yes | Your Dhali API's ID. |
| `path` | no | Appended to your base URL. Defaults to `/`. Paths can't leave your API: `..` segments that would reach another API are refused. |
| `format` | no | `html` (default) or `json`. See [Response formats](#response-formats). |
| `label` | no | Button text. Defaults to `Unlock`. The price and currency are added automatically: **Unlock report · 0.05 XRP**. |

- **The element's content is the teaser.** Everyone sees it, including search engines. It's removed when the section unlocks.
- **The price and currency come from Dhali**, from your API's settings, so it can't drift from what's actually charged.
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

## Loading the script

- **Keep the `integrity` attribute.** It makes the browser refuse to run the script if the file ever changes.
- **CDN:** `premium.js` comes from the [`dhali-premium`](https://www.npmjs.com/package/dhali-premium) npm package, through jsDelivr. The same file is at `https://unpkg.com/dhali-premium@1.0.0/releases/v1.0.0/premium.js`, with the same hash, if you prefer unpkg.
- **Self-hosting:** copy the file from the npm package to your own server and keep the same `integrity` value. The button frame always comes from pay.dhali.io.
- **Content-Security-Policy:** allow the CDN (or your own origin) in `script-src` and `https://pay.dhali.io` in `frame-src`.
- **Single-page apps:** `<dhali-premium>` is a standard custom element, so it works anywhere you can render HTML, including React, Vue and Svelte. Load the script once.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. `premium.js` uses custom elements and ES modules.

The first unlock opens the wallet in a popup. If a browser blocks it, the button asks the visitor to allow popups.
