# Changelog

Package versions. Each notes the `premium.js` version it ships (`premiumJs` in `package.json`). Published `premium.js` versions are immutable: partners pin them with an integrity hash.

## Unreleased

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
