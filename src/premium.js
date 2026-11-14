// <dhali-premium>: premium sections paid with XRP through Dhali.
//
// The payment claim never reaches this page. The Unlock button is an iframe
// served from pay.dhali.io (relay.html), which holds the claim, calls the
// Dhali proxy and hands back only the paid content. This script swaps that
// content in for the teaser as ordinary page content, so the site's own CSS
// applies.

const RELAY_ORIGIN = (
  document.querySelector('meta[name="dhali-relay-origin"]')?.content ||
  "https://pay.dhali.io"
).replace(/\/$/, "");

const byFrame = new Map(); // iframe contentWindow -> element

window.addEventListener("message", (event) => {
  if (event.origin !== RELAY_ORIGIN) return;
  const el = byFrame.get(event.source);
  if (!el) return;
  let msg;
  try {
    msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  if (msg?.type === "dhali:resize") el._resize(msg.height);
  else if (msg?.type === "dhali:content") el._unlock(msg);
  else if (msg?.type === "dhali:error") el._emit("dhali:error", { message: msg.message });
});

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const lookup = (data, path) =>
  path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), data);

class DhaliPremium extends HTMLElement {
  connectedCallback() {
    if (this._frame) {
      // Moved in the DOM (e.g. re-parented by a framework). Re-inserting an
      // iframe gives it a new browsing context, so register the new window.
      this._register();
      return;
    }
    const params = new URLSearchParams({
      api: this.getAttribute("api") || "",
      path: this.getAttribute("path") || "/",
      label: this.getAttribute("label") || "Unlock",
    });
    const frame = document.createElement("iframe");
    frame.src = `${RELAY_ORIGIN}/premium/relay.html#${params}`;
    frame.title = "Unlock premium content";
    frame.setAttribute("allowtransparency", "true");
    frame.style.cssText =
      "display:block;border:0;width:100%;height:52px;background:transparent;color-scheme:normal";
    this.append(frame);
    this._frame = frame;
    // The WindowProxy stays the same when the iframe navigates to the relay,
    // but not when the iframe is removed and re-inserted (see above).
    this._register();
  }

  // contentWindow is already null by the time disconnectedCallback runs, so
  // remember the window that was registered.
  _register() {
    this._window = this._frame.contentWindow;
    byFrame.set(this._window, this);
  }

  disconnectedCallback() {
    if (this._window) byFrame.delete(this._window);
    this._window = null;
    // If it's re-inserted, the iframe reloads the relay. Once unlocked, make
    // that load show "Unlocked" rather than a button that would charge again.
    // Set while detached, so it is the iframe's initial load, not a new
    // history entry.
    if (this._unlocked && !this._frame.src.endsWith("&done=1")) this._frame.src += "&done=1";
  }

  _resize(height) {
    if (Number.isFinite(height)) this._frame.style.height = `${Math.ceil(height)}px`;
  }

  _unlock({ body, charge }) {
    this._unlocked = true;
    const format = this.getAttribute("format") || "html";
    let data;
    let html = null;
    if (format === "json") {
      try {
        data = JSON.parse(body);
      } catch {
        this._emit("dhali:error", { message: "Premium response was not valid JSON" });
        return;
      }
      const template = this.querySelector(":scope > template");
      if (template) {
        html = template.innerHTML.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) =>
          escapeHtml(lookup(data, p) ?? "")
        );
      }
    } else {
      html = body;
    }

    if (html !== null) {
      const content = document.createElement("div");
      content.className = "dhali-premium-content";
      content.innerHTML = html;
      // Replace the teaser (everything except the template and the button).
      for (const node of [...this.childNodes]) {
        if (node !== this._frame && node.nodeName !== "TEMPLATE") node.remove();
      }
      this.insertBefore(content, this._frame);
    }
    this._emit("dhali:unlocked", { body, data, charge });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}

if (!customElements.get("dhali-premium")) {
  customElements.define("dhali-premium", DhaliPremium);
}
