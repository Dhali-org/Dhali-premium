// Builds what pay.dhali.io serves under /premium/ into dist/premium, using
// production endpoints. The wallet doesn't use this: it runs
// `dhali-premium install` (bin/) with the environment it is building.
//
//   npm run build

import { join } from "node:path";
import { ROOT, integrity, VERSION } from "./release.mjs";
import { install } from "./install.mjs";

const { out, versions } = install(join(ROOT, "dist/premium"), "prod");
console.log(`Built ${out}
  releases: ${versions.join(", ")}
  current v${VERSION} integrity ${integrity()}`);
