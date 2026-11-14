# Examples

| Example | What it shows |
|---|---|
| [`ledgerlight/`](ledgerlight/) | A complete partner site. It sells XRPL token risk reports built from live ledger data and uses both response formats. Run it with `npm run dev` from the repository root. |
| [`cloudflare-worker/`](cloudflare-worker/) | The quickest way to put static premium HTML behind Dhali, with no server of your own. |
| [`express/`](express/) | Middleware that protects premium routes in an existing Node.js app. |
| [`fastapi/`](fastapi/) | A dependency that protects premium routes in an existing Python app. |

Every backend example does the same job: it answers only requests that carry the header secret, which the Dhali proxy adds for you. See [Protect your endpoint](../README.md#2-protect-your-endpoint).
