// Relay for <dhali-premium>. Runs in an iframe on the pay.dhali.io origin.
//
// - Holds the visitor's payment claim. The partner page never sees it.
// - Only ever calls the one API named in its fragment, and only after a
//   click inside this frame. It accepts no commands from the host page.
// - Accepts a claim only from the wallet popup this frame opened, on the
//   wallet's origin (cfg.walletUrl).
//
// Served under a strict CSP (scripts and styles from this origin only), and
// it only ever writes text, never HTML: the relay shares an origin with the
// wallet, so a script injected here could reach the wallet.

(() => {
  const cfg = window.DHALI_RELAY_CONFIG;
  const params = new URLSearchParams(location.hash.slice(1));
  const api = params.get("api") || "";
  const path = params.get("path") || "/";
  const label = params.get("label") || "Unlock";

  const CHARGE_HEADER = "Dhali-Latest-Request-Charge";
  const CLAIM_KEY = "dhali.premium.claim";
  const VISIBLE_MS = 500; // clickjacking guard
  const WALLET_ORIGIN = new URL(cfg.walletUrl, location.href).origin;
  // One popup per frame. A shared name would let a second section reuse the
  // first section's popup, whose opener (and so its claim) is the first frame.
  const POPUP_NAME = `dhali-wallet-${Math.random().toString(36).slice(2)}`;

  const $action = document.getElementById("action");
  const $note = document.getElementById("note");
  const $badge = document.getElementById("badge");

  let state = "loading";
  let scale = 6;
  let code = "XRP";
  let popup = null;
  let visibleSince = null;
  let memoryClaim = null;
  let price = "";
  let freshClaim = false; // the claim just came from the wallet window

  // ---------- host page messaging ----------
  const toHost = (msg) => parent.postMessage(JSON.stringify(msg), "*");
  // Measure the body, not the document: the document is never smaller than
  // the iframe, so it could grow but never shrink.
  const reportSize = () => {
    const style = getComputedStyle(document.body);
    const height =
      document.body.getBoundingClientRect().height +
      parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    toHost({ type: "dhali:resize", height });
  };
  new ResizeObserver(reportSize).observe(document.body);

  // ---------- claim storage (partitioned per top-level site) ----------
  const claims = {
    get() {
      try { return localStorage.getItem(CLAIM_KEY) ?? memoryClaim; } catch { return memoryClaim; }
    },
    set(v) {
      memoryClaim = v;
      try { localStorage.setItem(CLAIM_KEY, v); } catch {}
    },
    clear() {
      memoryClaim = null;
      try { localStorage.removeItem(CLAIM_KEY); } catch {}
    },
  };

  // ---------- helpers ----------
  const toUnits = (minor) => {
    const n = Number(minor) / 10 ** scale;
    return `${+n.toFixed(scale)} ${code}`;
  };

  // Build the proxy URL and make sure `path` cannot escape this API
  // (e.g. "/../<other-uuid>/x" would otherwise spend the claim elsewhere).
  const targetUrl = () => {
    const base = new URL(cfg.proxyUrl);
    const prefix = `${base.pathname.replace(/\/$/, "")}/${api}`;
    const url = new URL(prefix + (path.startsWith("/") ? path : `/${path}`), base);
    if (url.origin !== base.origin || !(url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
      throw new Error("Invalid premium path");
    }
    return url;
  };

  const setState = (next, { note = "", warn = false, button = null, badge = null } = {}) => {
    state = next;
    $action.hidden = button === null;
    if (button !== null) {
      $action.textContent = button;
      $action.disabled = next === "busy" || next === "waiting" || next === "loading";
    }
    $badge.hidden = badge === null;
    if (badge !== null) $badge.textContent = badge;
    $note.textContent = note;
    $note.className = warn ? "note warn" : "note";
    reportSize();
  };

  const fail = (message) => {
    setState("idle", { button: `${label} · ${price}`, note: message, warn: true });
    toHost({ type: "dhali:error", message });
  };

  // ---------- 402 handling ----------
  // Dhali returns an HTML page when no claim is sent, and JSON {detail} when
  // the claim is invalid or does not cover the request. The "not sufficient"
  // detail says how much was authorised and how much this request could need.
  const explain402 = async (res) => {
    const text = await res.text();
    let detail = "";
    try { detail = String(JSON.parse(text).detail ?? ""); } catch {}
    const authorised = /authorized to pull\s+(\d+)/i.exec(detail);
    const needed = /as much as\s+(\d+)/i.exec(detail);
    if (authorised && needed) {
      const shortfall = Math.max(Number(needed[1]) - Number(authorised[1]), 1);
      return `This unlock needs about ${toUnits(shortfall)} more. Approve more in your wallet to continue.`;
    }
    if (/channel is closed/i.test(detail)) {
      claims.clear();
      return "Your payment channel is closed. Open a new one in your wallet.";
    }
    if (detail) {
      claims.clear();
      return "Your saved approval is no longer valid. Approve again in your wallet.";
    }
    return "Approve a payment in your wallet to continue.";
  };

  // ---------- paid request ----------
  const request = async () => {
    const claim = claims.get();
    if (!claim) return openWallet();
    // The wallet didn't open for this unlock, so say where the money came from.
    const fromSaved = !freshClaim;
    freshClaim = false;
    setState("busy", { button: "Unlocking…" });

    let url;
    try { url = targetUrl(); } catch (e) { return fail(e.message); }

    let res;
    try {
      res = await fetch(url, { headers: { "Payment-Claim": claim }, credentials: "omit" });
    } catch {
      return fail("Couldn't reach Dhali. Check your connection and try again.");
    }

    if (res.status === 402) {
      const note = await explain402(res);
      return setState("needs-approval", { button: "Approve more XRP", note, warn: true });
    }
    const charge = res.headers.get(CHARGE_HEADER);
    if (!res.ok) {
      // Dhali still charges the compute a failed request used, not the price.
      const paid = charge ? `You paid ${toUnits(charge)} for compute` : "You paid only for compute";
      return fail(`The premium service returned an error (${res.status}). ${paid}, not the unlock price.`);
    }

    const body = await res.text();
    toHost({ type: "dhali:content", body, charge: charge ? toUnits(charge) : null });
    const paid = charge ? `Paid ${toUnits(charge)}` : "";
    const note = fromSaved ? `${paid || "Paid"} from your saved approval` : paid;
    setState("unlocked", { badge: "✓ Unlocked", note });
    const left = await remaining(claim);
    if (left !== null && state === "unlocked") {
      setState("unlocked", { badge: "✓ Unlocked", note: `${note} · ${toUnits(left)} left` });
    }
  };

  // ---------- remaining approval ----------
  // What's left of the claim: the amount it authorises minus what Dhali has
  // already charged to the channel. Only where the deployment has a usage
  // endpoint (the local mock does); otherwise null and the note stays as is.
  const remaining = async (claim) => {
    if (!cfg.devChannelsUrl) return null;
    let parsed = null;
    try { parsed = JSON.parse(atob(claim)); } catch { try { parsed = JSON.parse(claim); } catch {} }
    const authorised = Number(parsed?.authorized_to_claim);
    if (!parsed?.channel_id || !Number.isFinite(authorised)) return null;
    try {
      const res = await fetch(`${cfg.devChannelsUrl}/${encodeURIComponent(parsed.channel_id)}`, { credentials: "omit" });
      if (!res.ok) return null;
      const used = Number((await res.json()).to_claim);
      return Number.isFinite(used) ? Math.max(authorised - used, 0) : null;
    } catch {
      return null;
    }
  };

  // ---------- wallet popup ----------
  const openWallet = () => {
    const url = new URL(cfg.walletUrl, location.href);
    url.searchParams.set("uuids", api);
    // Tells the wallet its visitor is paying for content, not calling an API.
    url.searchParams.set("source", "premium");
    popup = window.open(url, POPUP_NAME, "popup,width=480,height=780");
    if (!popup) {
      return setState("idle", {
        button: `${label} · ${price}`,
        note: "Your browser blocked the wallet window. Allow pop-ups for this site and try again.",
        warn: true,
      });
    }
    setState("waiting", { button: "Waiting for wallet…", note: "Approve the payment in the wallet window." });
    const watch = setInterval(() => {
      if (state !== "waiting") return clearInterval(watch);
      if (popup.closed) {
        clearInterval(watch);
        setState("idle", { button: `${label} · ${price}`, note: "Wallet closed before a payment was approved." });
      }
    }, 500);
  };

  window.addEventListener("message", (event) => {
    // Only the wallet window this frame opened. Other relay frames on the page
    // share our origin, so the origin check alone isn't enough.
    if (event.origin !== WALLET_ORIGIN || !popup || event.source !== popup) return;
    let msg;
    try { msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (msg?.type !== "dhali:payment-claim" || typeof msg.claim !== "string") return;
    claims.set(msg.claim);
    try {
      event.source.postMessage(JSON.stringify({ type: "dhali:claim-received" }), WALLET_ORIGIN);
    } catch {}
    if (state === "waiting") {
      freshClaim = true;
      request();
    }
  });

  // ---------- click handling ----------
  // Ignore clicks until the button has been on screen for a moment, so a
  // hostile page can't slide it under the cursor at the last instant.
  //
  // Limits: only Chromium supports trackVisibility (IntersectionObserver v2),
  // which also catches the frame being covered, made transparent or
  // transformed. Other browsers fall back to isIntersecting, which only knows
  // the button is inside the viewport, so there the guard stops last-instant
  // scrolling or moving of the frame, not an overlay drawn on top of it.
  const io = new IntersectionObserver(
    ([entry]) => {
      const visible = "isVisible" in entry ? entry.isVisible : entry.isIntersecting;
      visibleSince = visible ? (visibleSince ?? performance.now()) : null;
    },
    { threshold: [0, 1], trackVisibility: true, delay: 100 }
  );
  io.observe($action);

  $action.addEventListener("click", () => {
    if (visibleSince === null || performance.now() - visibleSince < VISIBLE_MS) return;
    if (state === "idle") request();
    else if (state === "needs-approval") openWallet();
  });

  // ---------- start ----------
  const start = async () => {
    // Set by premium.js when an unlocked section is re-inserted in the DOM.
    // It only hides the button, which the host page could do anyway.
    if (params.get("done") === "1") return setState("unlocked", { badge: "✓ Unlocked" });
    if (!/^[0-9a-f-]{32,40}$/i.test(api)) {
      return setState("error", { note: "This premium section is misconfigured (invalid API ID).", warn: true });
    }
    try {
      const res = await fetch(`${cfg.metadataUrl}/${api}`, { credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      const meta = await res.json();
      scale = Number(meta.asset_earning_currency?.scale ?? 6);
      code = meta.asset_earning_currency?.code ?? "XRP";
      price = toUnits(meta.asset_earning_rate) + (meta.asset_earning_type === "per_second" ? "/s" : "");
    } catch {
      return setState("error", { note: "Premium content is unavailable right now.", warn: true });
    }
    setState("idle", { button: `${label} · ${price}`, note: "Paid in XRP from your wallet" });
  };

  start();
})();
