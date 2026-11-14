// Token risk report built from public XRPL ledger data.

const NODES = ["https://xrplcluster.com/", "https://s1.ripple.com:51234/"];
const TIMEOUT_MS = 10_000;

// Account flags (https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/accountroot)
const lsfDisableMaster = 0x00100000;
const lsfNoFreeze = 0x00200000;
const lsfGlobalFreeze = 0x00400000;
const lsfAllowTrustLineClawback = 0x80000000;

// Addresses nobody holds a key for.
const BLACK_HOLES = new Set([
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
  "rrrrrrrrrrrrrrrrrrrrBZbvji",
  "rrrrrrrrrrrrrrrrrNAMEtxvNvQ",
  "rrrrrrrrrrrrrrrrrrrn5RM1rHd",
]);

const MAX_LINE_PAGES = 5; // up to 2,000 trust lines

export const isAddress = (s) => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s);

export function currencyToCode(input) {
  const c = input.trim();
  if (/^[0-9A-Fa-f]{40}$/.test(c)) return c.toUpperCase();
  if (c.length === 3 && c.toUpperCase() !== "XRP") return c;
  if (c.length > 3 && c.length <= 20) {
    return Buffer.from(c, "ascii").toString("hex").toUpperCase().padEnd(40, "0");
  }
  throw new Error("Invalid currency code");
}

export function currencyLabel(code) {
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  const text = Buffer.from(code, "hex").toString("latin1").replace(/\0+$/, "");
  return /^[\x20-\x7e]+$/.test(text) ? text : code;
}

async function rpc(method, params) {
  let lastError;
  for (const node of NODES) {
    try {
      const res = await fetch(node, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, params: [params] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = await res.json();
      const result = json.result ?? {};
      if (result.status === "error") {
        const err = new Error(result.error_message || result.error);
        err.code = result.error;
        throw err;
      }
      return result;
    } catch (e) {
      if (e.code) throw e; // a ledger answer, not a network problem
      lastError = e;
    }
  }
  throw lastError;
}

async function trustLines(issuer, code) {
  const holders = [];
  let marker;
  let complete = true;
  for (let page = 0; page < MAX_LINE_PAGES; page++) {
    const r = await rpc("account_lines", {
      account: issuer,
      ledger_index: "validated",
      limit: 400,
      ...(marker ? { marker } : {}),
    });
    for (const l of r.lines ?? []) {
      if (l.currency !== code) continue;
      const held = -Number(l.balance); // issuer's view: negative = holder owns tokens
      if (held > 0) holders.push({ account: l.account, held });
    }
    marker = r.marker;
    if (!marker) break;
    if (page === MAX_LINE_PAGES - 1) complete = false;
  }
  holders.sort((a, b) => b.held - a.held);
  return { holders, complete };
}

async function amm(issuer, code) {
  try {
    const r = await rpc("amm_info", {
      asset: { currency: "XRP" },
      asset2: { currency: code, issuer },
      ledger_index: "validated",
    });
    return {
      xrp: Number(r.amm.amount) / 1e6,
      tokens: Number(r.amm.amount2.value),
      fee: r.amm.trading_fee / 1000, // units of 1/100,000 -> percent
    };
  } catch (e) {
    if (e.code === "actNotFound") return null;
    throw e;
  }
}

const fmt = (n, digits = 2) =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });

export async function tokenReport(issuer, currencyInput) {
  const code = currencyToCode(currencyInput);
  const token = currencyLabel(code);

  const info = await rpc("account_info", {
    account: issuer,
    ledger_index: "validated",
    signer_lists: true,
  });
  const acct = info.account_data;
  const flags = acct.Flags >>> 0;
  const signerLists = info.signer_lists ?? acct.signer_lists ?? [];

  const [gateway, lines, pool] = await Promise.all([
    rpc("gateway_balances", { account: issuer, ledger_index: "validated", strict: true }),
    trustLines(issuer, code),
    amm(issuer, code),
  ]);

  const supply = Number(gateway.obligations?.[code] ?? 0);
  const masterDisabled = Boolean(flags & lsfDisableMaster);
  const regularKey = acct.RegularKey;
  const blackholed =
    masterDisabled && (!regularKey || BLACK_HOLES.has(regularKey)) && signerLists.length === 0;
  const transferFee = acct.TransferRate ? (acct.TransferRate / 1e9 - 1) * 100 : 0;
  const top10 = lines.holders.slice(0, 10).reduce((s, h) => s + h.held, 0);
  const top10Share = supply > 0 ? (top10 / supply) * 100 : 0;
  const domain = acct.Domain ? Buffer.from(acct.Domain, "hex").toString("utf8") : null;

  const checks = [];
  const add = (status, label, detail) => checks.push({ status, label, detail });

  add(
    blackholed ? "ok" : "warn",
    blackholed ? "Supply is locked" : "Issuer can create more tokens",
    blackholed
      ? "The issuer's keys are disabled, so no more tokens can ever be issued."
      : "The issuer account is still controlled by a key, so it can issue more tokens at any time."
  );
  add(
    flags & lsfAllowTrustLineClawback ? "bad" : "ok",
    flags & lsfAllowTrustLineClawback ? "Issuer can claw back tokens" : "No clawback",
    flags & lsfAllowTrustLineClawback
      ? "The issuer has enabled clawback and can take tokens back from holders. This is common for regulated stablecoins."
      : "The issuer cannot take tokens back from holders."
  );
  if (flags & lsfGlobalFreeze) {
    add("bad", "Token is frozen", "The issuer has frozen all trading of this token.");
  } else {
    add(
      flags & lsfNoFreeze ? "ok" : "warn",
      flags & lsfNoFreeze ? "Can't be frozen" : "Issuer can freeze holdings",
      flags & lsfNoFreeze
        ? "The issuer has permanently given up the ability to freeze this token."
        : "The issuer can freeze individual holders or the whole token."
    );
  }
  add(
    transferFee >= 0.1 ? "warn" : "ok",
    transferFee > 0 ? `${fmt(transferFee, 3)}% transfer fee` : "No transfer fee",
    transferFee > 0
      ? "A fee is taken every time the token moves between accounts."
      : "Holders can move this token without an issuer fee."
  );
  if (lines.complete) {
    add(
      top10Share > 50 ? "bad" : top10Share > 25 ? "warn" : "ok",
      `Top 10 holders own ${fmt(top10Share, 1)}%`,
      top10Share > 50
        ? "A few wallets control most of the supply and could move the price sharply."
        : "Supply is reasonably spread out among holders."
    );
  } else {
    add(
      "info",
      `Over ${fmt(lines.holders.length, 0)} holders`,
      "Too many holders to rank in one report, so concentration isn't scored."
    );
  }
  if (pool) {
    add(
      pool.xrp < 10_000 ? "warn" : "ok",
      `${fmt(pool.xrp, 0)} XRP in the AMM pool`,
      pool.xrp < 10_000
        ? "Liquidity is thin, so larger trades will move the price a lot."
        : "There is meaningful liquidity against XRP."
    );
  } else {
    add("warn", "No XRP AMM pool", "There is no XRP/token AMM pool on the ledger.");
  }

  const bad = checks.filter((c) => c.status === "bad").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const verdict =
    bad > 0
      ? { status: "bad", label: "Issuer keeps significant control" }
      : warn > 1
        ? { status: "warn", label: "Some issuer controls remain" }
        : { status: "ok", label: "Few issuer controls" };

  return {
    token,
    issuer,
    domain,
    verdict,
    checks,
    stats: {
      supply,
      holders: lines.holders.length,
      holdersComplete: lines.complete,
      top10Share,
      pool,
    },
    ledgerIndex: info.ledger_index,
    generatedAt: new Date().toISOString(),
  };
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function reportHtml(r) {
  const s = r.stats;
  return `<section class="risk-report">
  <div class="verdict ${r.verdict.status}">
    <strong>${esc(r.verdict.label)}</strong>
    <span>${esc(r.token)}${r.domain ? ` · ${esc(r.domain)}` : ""}</span>
  </div>
  <ul class="checks">
    ${r.checks
      .map(
        (c) => `<li class="${c.status}"><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></li>`
      )
      .join("\n    ")}
  </ul>
  <dl class="stats">
    <div><dt>Supply</dt><dd>${fmt(s.supply, 0)}</dd></div>
    <div><dt>Holders</dt><dd>${fmt(s.holders, 0)}${s.holdersComplete ? "" : "+"}</dd></div>
    <div><dt>Top 10 share</dt><dd>${s.holdersComplete ? `${fmt(s.top10Share, 1)}%` : "n/a"}</dd></div>
    <div><dt>AMM liquidity</dt><dd>${s.pool ? `${fmt(s.pool.xrp, 0)} XRP` : "None"}</dd></div>
  </dl>
  <p class="fineprint">From the XRP Ledger at ledger ${esc(r.ledgerIndex)}. ${
    s.holdersComplete ? "" : "Holder count covers the first 2,000 trust lines. "
  }Not financial advice.</p>
</section>`;
}
