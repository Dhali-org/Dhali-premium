# Changelog

Package versions. Each notes the `premium.js` version it ships (`premiumJs` in `package.json`). Published `premium.js` versions are immutable: partners pin them with an integrity hash.

## 1.2.0 (2026-11-17)

`premium.js` v1.0.0 (unchanged).

- Relay: when a saved approval will pay, the section says which wallet it pays from ("Paying from rXXXX…YYYY") and offers **Change**, which forgets the approval and opens the wallet. Before, the only way to switch wallets was to clear the browser's site data for pay.dhali.io. Change never pays: the new approval is saved for the next unlock, and an unlocked section stays unlocked.
- Relay: when Dhali refuses the saved approval, the section says so and shows Dhali's own explanation in a collapsed **Details from Dhali** box. It used to pick amounts out of that message, which broke for version 2 claims (every current wallet): Dhali gives their amounts in whole units ("0.25 XRP"), so the section asked for 0.000001 XRP more. The saved approval is no longer forgotten on a refusal; approving in the wallet replaces it.
- Relay: a failed unlock says "This unlock didn't go through (error N). You weren't charged the unlock price. Try again.", with any JSON `detail` in a collapsed **Details** box. It used to say "The premium service returned an error" and "You paid only for compute" every time, but the error can come from Dhali itself, some failures cost nothing, and the proxy doesn't let browsers read the charge on errors. The compute charge is mentioned only when it can be read and is above zero.
- Sandbox: the mock proxy's refusal message matches the real proxy for version 1 and version 2 claims. On a partner error it passes the partner's status and body through without exposing the charge, as the real proxy does.

## 1.1.2 (2026-11-17)

`premium.js` v1.0.0 (unchanged).

- Relay: the note under the button and the top-up button name the API's currency, instead of always saying XRP. An RLUSD-priced section said "Paid in XRP from your wallet".

## 1.1.1 (2026-11-16)

`premium.js` v1.0.0 (unchanged). The v1.1.0 tag was pushed without the version bump, so 1.1.0 was never published; this is that release.

- Relay: opens the wallet with `?source=premium`, so the wallet can show plain payment steps instead of developer instructions.
- The partner snippet loads `premium.js` from the npm package through jsDelivr (`cdn.jsdelivr.net/npm/dhali-premium@<version>/releases/v<premiumJs>/premium.js`) instead of pay.dhali.io. The file and its hash are unchanged.
- `npm run verify:cdn` checks that jsDelivr and unpkg serve every frozen `premium.js` with its recorded hash. The publish workflow runs it after publishing.

## 1.0.0 (2026-11-14)

`premium.js` v1.0.0.

- Packaged as `dhali-premium`. The wallet installs it with `dhali-premium install <dir> --env <prod|staging>`.

- `<dhali-premium>` element with `api`, `path`, `format` and `label` attributes.
- `html` and `json` (with `<template>`) response formats.
- `dhali:unlocked` and `dhali:error` events.
- Relay on pay.dhali.io that keeps the visitor's payment claim out of the partner page.
- `<dhali-premium>` keeps working after it is moved in the DOM. An unlocked section that is moved stays unlocked and doesn't offer to charge again.
- Relay: a failed request says what was paid for compute, instead of claiming nothing was charged.
- Relay: after an unlock, the section says what was paid and, when the wallet didn't open, that it came from the saved approval. Where the environment has a channel usage endpoint (the local sandbox only, for now), it also shows how much of the approval is left.
- `dhali-premium install` only replaces a previous install. It refuses a directory with other files in it, and the current directory or its parents.
- FastAPI example refuses to start with an empty `DHALI_SECRET`.
- Relay: one wallet popup per section, claims accepted only from that popup, strict CSP, and per-environment endpoints.
