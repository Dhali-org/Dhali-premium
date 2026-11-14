# Maintainer guide

For the Dhali team: building, testing, releasing and deploying Premium Sections on pay.dhali.io.

## Layout

```
src/premium.js                <dhali-premium>, the version being worked on
releases/                     every published premium.js, frozen, with integrity.json
src/relay/                    relay.html, relay.css, relay.js → /premium/ on pay.dhali.io
bin/dhali-premium.mjs         `dhali-premium install <dir> --env <env>`, run by the wallet build
scripts/install.mjs           what that command writes
scripts/release.mjs           versions, per-environment endpoints (config.js) and the relay's CSP
scripts/                      also build, freeze, snippet
examples/                     partner examples (Ledgerlight, Cloudflare Worker, Express, FastAPI)
dev/                          local sandbox: dev server, mock wallet, mock Dhali proxy
test/                         unit tests (offline) and a browser end-to-end test
docs/                         partner docs and the original design proposal
```

## Local sandbox

```sh
npm run dev
```

| Origin | Stands in for |
|---|---|
| `http://localhost:4000` | Partner site (Ledgerlight) |
| `http://127.0.0.1:4001` | pay.dhali.io: relay, `premium.js`, **mock** wallet |
| `http://127.0.0.1:4002` | run.api.dhali.io and get.api.dhali.io: **mock** proxy |
| `http://localhost:4003` | Partner backend (the API's base URL) |

`localhost` and `127.0.0.1` are different sites, so the relay iframe is cross-site and its storage is partitioned, as in production. The dev server serves `src/` directly, generates a local `config.js`, and sends the production CSP on `relay.html` with the sandbox endpoints.

The mocks:

- **`dev/mock-wallet.html`** returns claims the way the patched pay.dhali.io does, but signs nothing.
- **`dev/mock-dhali.mjs`** copies the real proxy (`Dhali-marketplace/src/micro_services/inference-gateway`):
  - the worst-case check, `(0.05·60000 + 1.02·rate)·1.05` drops plus surcharge
  - the charge, `ceil(0.05·runtime_ms + 1.02·rate)`
  - the 402 responses: HTML with no claim, JSON `detail` for an invalid or insufficient claim
  - header-secret forwarding, the `Dhali-Latest-Request-Charge` header and CORS

  It doesn't verify signatures. Re-check it against the proxy source when the proxy changes.

## Tests

```sh
npm test            # offline: release hash, README snippet, mock proxy, header-secret checks
npm install         # once, for puppeteer-core
npm run test:e2e    # full flow in headless Chrome against the sandbox (needs internet for XRPL)
```

`test:e2e` uses Chrome at `/usr/bin/google-chrome`, or set `CHROME_PATH`. It checks that:

- the first unlock opens the wallet, the claim is handed back and the wallet closes
- the next unlock needs no popup, and the JSON template renders
- the button explains the shortfall when the approval runs out
- the partner page's own storage never holds a claim
- the page doesn't overflow horizontally at 375px

## Versions

There are two:

- **`premiumJs`** in `package.json` is the version of `premium.js`, which names its URL (`/premium/v<premiumJs>/premium.js`). Published versions are immutable, because partners pin them with an integrity hash.
- **`version`** in `package.json` is the package version. The wallet pins it, so every change it should pick up, including relay-only fixes, is a new package version and a `v<version>` git tag.

## Releasing a new `premium.js`

1. Bump `premiumJs` in `package.json`, then change `src/premium.js`.
2. Run `npm run freeze`. It copies `src/premium.js` to `releases/v<premiumJs>/premium.js` and records its hash. Rerun it after every further change, with `--force`, until the version is deployed. After that, never overwrite it.
3. Run `npm run snippet` and put the new snippet in the README's quick start. `npm test` fails until the README and the frozen copy match `src/premium.js`.
4. Release the package (below).

Never delete a directory under `releases/`. Every version in it is served for as long as partners may pin it.

## Releasing the package

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Run `npm test` (and `npm run test:e2e`).
3. Commit, tag `v<version>` and push the tag.

Pushing the tag runs [`.github/workflows/publish.yaml`](../.github/workflows/publish.yaml). It checks that the tag matches `version` in `package.json`, runs `npm test` and publishes the package to npm. It needs an npm automation token in the repository's (or organisation's) `NPM_PUBLISH_TOKEN` secret.

Relay changes (`src/relay/`) need no new `premium.js`. The relay is loaded by URL with no hash, so changes reach every partner when the wallet deploys the new package. Keep its message format backwards compatible with every published `premium.js`.

## Deploying to pay.dhali.io

The Dhali-wallet repo depends on this package through npm:

```json
"devDependencies": { "dhali-premium": "github:Dhali-org/Dhali-premium#semver:^1.0.0" }
```

Its deploy workflows run `npm ci` and then `npx dhali-premium install web/premium --env <prod|staging>` before `flutter build web`, so `web/premium/` is generated, not committed. To deploy a new package version, in Dhali-wallet:

```sh
npm install dhali-premium@github:Dhali-org/Dhali-premium#semver:^1.1.0   # or: npm update dhali-premium
git commit package.json package-lock.json
```

`package-lock.json` pins the exact commit, so builds are reproducible until the lock file changes.

The wallet also holds the parts that are wallet code or hosting config:

- **`lib/wallet_widgets/account_view_widget.dart`:** `returnClaimToOpener()`, called from `showPaymentClaimSuccessDialog`. If the relay opened the wallet, the wallet posts the new claim to the relay origin (its own, or `PREMIUM_RELAY_ORIGIN`) and closes once the relay confirms receipt. Using the wallet directly is unchanged.
- **`firebase*.json`:** `Access-Control-Allow-Origin: *` on `/premium/**/*.js`, because partners load `premium.js` with an integrity hash, which needs CORS. A strict `Content-Security-Policy` on `/premium/relay.html`: only its own scripts and styles, and network access only to that environment's proxy and metadata service.

Endpoints live in `ENVIRONMENTS` in `scripts/release.mjs`. If you change an origin there, update the matching `connect-src` in the wallet's `firebase*.json` (`relayCsp()` prints the expected value).

### Moving the relay to its own origin

The relay shares an origin with the wallet, so a script injected into the relay could reach the wallet through its popup. The CSP and text-only rendering guard against that. Serving the relay from a separate origin (e.g. `premium.dhali.io`) removes the risk. The code is ready for it:

1. Create a Firebase hosting site for the new origin that serves `/premium/` with the same headers.
2. Set `walletUrl` to `https://pay.dhali.io/` (and the staging wallet URL) in `ENVIRONMENTS`. The relay only trusts claims from that origin.
3. Build the wallet with `--dart-define=PREMIUM_RELAY_ORIGIN=https://premium.dhali.io`, so it addresses claims there.
4. Release a new `premium.js` whose default `RELAY_ORIGIN` is the new origin. Earlier versions keep working while pay.dhali.io still serves `/premium/`.

Hosting requirements:

- **Don't send `Cross-Origin-Opener-Policy: same-origin`** from pay.dhali.io. It would cut the link between the wallet popup and the relay.
- **Allow pay.dhali.io to be framed.** It is today: there's no `X-Frame-Options` or `frame-ancestors`. If either is added, exempt `/premium/relay.html`.

No changes are needed to app.dhali.io or run.api.dhali.io. The proxy already allows cross-origin requests with `Payment-Claim`, and partners register a reverse-proxy API as they do today.
