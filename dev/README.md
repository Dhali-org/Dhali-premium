# Local sandbox

`npm run dev` runs the full flow on four local origins, using stand-ins for the Dhali wallet and proxy. See [docs/maintainers.md](../docs/maintainers.md#local-sandbox) for what each origin stands in for and how closely the mocks follow the real services.

| File | |
|---|---|
| `start.mjs` | Dev server for all four origins |
| `mock-wallet.html` | Stand-in for pay.dhali.io. It returns claims like the patched wallet, but signs nothing. |
| `mock-dhali.mjs` | Stand-in for run.api.dhali.io and get.api.dhali.io. It doesn't verify claims. |
