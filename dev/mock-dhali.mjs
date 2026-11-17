// Local stand-in for run.api.dhali.io and get.api.dhali.io.
//
// Mirrors the real proxy (Dhali-marketplace inference-gateway/proxy/http_proxy.py):
// - 402 HTML page when no Payment-Claim is sent
// - 402 JSON {detail} when the claim can't be parsed or doesn't cover the
//   worst-case cost of the request
// - forwards to the API's base URL with the API's header secret
// - returns Dhali-Latest-Request-Charge, CORS open to all origins
// Claims are NOT cryptographically verified here.

import http from "node:http";

const COMPUTE_COST_PER_MS = 0.05; // DHALI_CPU_INFERENCE_COST_PER_MS (XRP rate 1)
const DHALI_FEE = 0.02; // DHALI_EARNINGS_PERCENTAGE_PER_INFERENCE / 100
const MAX_RUNTIME_MS = 60_000;
const CHARGE_HEADER = "Dhali-Latest-Request-Charge";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
  "access-control-allow-headers": "payment-claim",
  "access-control-max-age": "600",
};

const errorPage = (uuid) => `
        <html>
        <head><title>Payment Required</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>🚫 Payment Required</h1>
            <p>You accessed a Dhali linked API but did not provide a <strong>'Payment-Claim'</strong> header.</p>
            <a href="https://pay.dhali.io?uuids=${uuid}">Pay Now</a>
        </body>
        </html>`;

function decodeClaim(raw) {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

/**
 * @param {Record<string, {name: string, rate: number, baseUrl: string, headers: Record<string,string>}>} apis
 */
export function createMockDhali(apis) {
  const channels = new Map(); // channel_id -> drops charged so far

  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { ...cors, "content-type": "application/json", ...extra });
    res.end(JSON.stringify(body));
  };

  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(200, { ...cors, "content-type": "text/plain" });
      return res.end("OK");
    }
    const url = new URL(req.url, "http://mock");
    const parts = url.pathname.split("/").filter(Boolean);

    // get.api.dhali.io/<uuid>
    if (parts[0] === "get" && parts.length === 2) {
      const api = apis[parts[1]];
      if (!api) return json(res, 404, { detail: "Unknown API" });
      return json(res, 200, {
        api_protocol: "http",
        asset_earning_currency: { scale: 6, code: "XRP" },
        asset_earning_max_surcharge: 0,
        asset_earning_rate: api.rate,
        asset_earning_type: "per_request",
        name: api.name,
      });
    }

    // Dev only: lets the mock wallet show how much of the channel is used.
    if (parts[0] === "dev" && parts[1] === "channels" && parts[2]) {
      return json(res, 200, { to_claim: channels.get(parts[2]) ?? 0 });
    }

    // run.api.dhali.io/<uuid>/<path>
    if (parts[0] !== "run" || !parts[1]) return json(res, 404, { detail: "No API requested" });
    const uuid = parts[1];
    const rest = "/" + url.pathname.split("/").slice(3).join("/");
    const api = apis[uuid];

    const rawClaim = req.headers["payment-claim"] ?? url.searchParams.get("Payment-Claim");
    if (!rawClaim) {
      res.writeHead(402, { ...cors, "content-type": "text/html; charset=utf-8" });
      return res.end(errorPage(uuid));
    }
    if (!api) return json(res, 400, { detail: "Invalid API requested" });

    const claim = decodeClaim(rawClaim);
    if (!claim || !claim.channel_id || !claim.authorized_to_claim || !claim.signature) {
      return json(res, 402, { detail: "You must provide a payment channel claim that can be parsed" });
    }

    const maxCost = (COMPUTE_COST_PER_MS * MAX_RUNTIME_MS + (1 + DHALI_FEE) * api.rate) * 1.05;
    const toClaim = (channels.get(claim.channel_id) ?? 0) + maxCost;
    const authorised = Number(claim.authorized_to_claim);
    if (authorised < toClaim) {
      const scale = Number(claim.currency?.scale ?? 6);
      const codeName = claim.currency?.code ?? "XRP";
      const detail =
        claim.version === "2"
          ? `Your payment claim is not sufficient to fund this request.\n\n
            It was authorized to pull ${authorised / 10 ** scale}
            ${codeName} from your payment channel.\n\n
            However, Dhali has determined that this request COULD consume as much as
            ${toClaim / 10 ** scale}
            ${codeName} (note, Dhali may over-estimate this for our user's safety).`
          : `Your payment claim is not sufficient to fund this request.\n\n
            It was authorized to pull ${authorised} from your payment channel.
            However, Dhali has determined that this request COULD consume as much as
            ${Math.ceil(toClaim)} (note, Dhali may over-estimate this for our user's safety).`;
      return json(res, 402, { detail });
    }

    const start = performance.now();
    const query = new URLSearchParams(url.search);
    query.delete("Payment-Claim");
    query.delete("payment-claim");
    const qs = query.toString();
    let upstream;
    try {
      upstream = await fetch(api.baseUrl.replace(/\/$/, "") + rest + (qs ? `?${qs}` : ""), {
        method: req.method,
        headers: {
          accept: req.headers.accept ?? "*/*",
          "x-forwarded-for": req.socket.remoteAddress ?? "",
          ...api.headers,
        },
      });
    } catch {
      // As the real proxy: its own 500, charge not exposed to browsers.
      return json(res, 500, { detail: "An unexpected error occured with Dhali. Please try again." }, {
        [CHARGE_HEADER]: "0",
      });
    }
    const runtimeMs = performance.now() - start;
    const body = Buffer.from(await upstream.arrayBuffer());

    if (!(upstream.status >= 200 && upstream.status < 400)) {
      // As the real proxy (http_proxy.py): failed requests only pay compute,
      // and the upstream's status and body pass straight through. The charge
      // header is set but not exposed, so a browser can't read it.
      const compute = Math.ceil(COMPUTE_COST_PER_MS * runtimeMs);
      channels.set(claim.channel_id, (channels.get(claim.channel_id) ?? 0) + compute);
      res.writeHead(upstream.status, { ...cors, [CHARGE_HEADER]: String(compute) });
      return res.end(body);
    }

    const actual = Math.ceil(COMPUTE_COST_PER_MS * runtimeMs + api.rate * (1 + DHALI_FEE));
    channels.set(claim.channel_id, (channels.get(claim.channel_id) ?? 0) + actual);
    res.writeHead(upstream.status, {
      ...cors,
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      [CHARGE_HEADER]: String(actual),
      "access-control-expose-headers": `${CHARGE_HEADER}, Dhali-Total-Requests-Charge`,
    });
    res.end(body);
  });
}
