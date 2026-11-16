# Ledgerlight: token risk reports

Ledgerlight is a fictional partner site. It sells XRPL token risk reports, one unlock per report, built from live ledger data:

- whether the issuer's supply is locked (master key disabled, or a black-hole regular key)
- clawback, freeze and global freeze
- transfer fee
- holder count and concentration
- AMM liquidity against XRP

## Run it

From the repository root:

```sh
npm run dev
```

Open http://localhost:4000 and click **Unlock report**.

Locally, the wallet and the Dhali proxy are stand-ins (see [`dev/`](../../dev/)). The wallet signs nothing, and the proxy doesn't verify claims. The backend calls public XRPL nodes, so it needs internet access.

## What to look at

| File | Shows |
|---|---|
| [`site/index.html`](site/index.html) | The integration: one script tag and a `<dhali-premium>` element per section. The page styles the unlocked report (`.risk-report`) with its own CSS. |
| [`backend/server.mjs`](backend/server.mjs) | The premium endpoint, which is the API's base URL. It rejects requests without the header secret and serves `GET /reports/:issuer/:currency` as HTML, or as JSON with a `.json` suffix. |
| [`backend/xrpl.mjs`](backend/xrpl.mjs) | The report itself, built from `account_info`, `gateway_balances`, `account_lines` and `amm_info`. |

The page uses both response formats:

- **RLUSD and SOLO** use `format="html"`. The backend returns a styled HTML fragment.
- **CORE** uses `format="json"` with a `<template>`. The backend returns data, and the page fills in `{{verdict.label}}`, `{{stats.holders}}` and `{{ledgerIndex}}`.

The lookup form adds sections at runtime, which shows that `<dhali-premium>` works on elements created after the page loads.

## Run the backend on its own

```sh
PARTNER_SECRET=$(openssl rand -hex 32) PORT=4003 node examples/ledgerlight/backend/server.mjs
```

| Variable | Default |
|---|---|
| `PARTNER_SECRET` | none, so it's required |
| `PARTNER_SECRET_HEADER` | `x-partner-secret` |
| `PORT` | `4003` |

To take it live, host the backend somewhere public, register its URL as a Dhali API, and put that API's ID into the page. The [main README](../../README.md#get-started) covers each step.
