// Serves premium content only to requests forwarded by the Dhali proxy.
//
// 1. Put your premium HTML fragments (or JSON) in ./premium-content/.
// 2. `npx wrangler secret put DHALI_SECRET` (the header secret you set in app.dhali.io)
// 3. `npx wrangler deploy`, then register the Worker's URL as your API's base URL.
//
// Requests without the secret get 403, so nobody can skip payment by calling
// the Worker directly.

export default {
  async fetch(request, env) {
    const header = env.SECRET_HEADER || "x-partner-secret";
    const got = new TextEncoder().encode(request.headers.get(header) ?? "");
    const want = new TextEncoder().encode(env.DHALI_SECRET ?? "");
    const ok =
      want.byteLength > 0 &&
      got.byteLength === want.byteLength &&
      crypto.subtle.timingSafeEqual(got, want);
    if (!ok) return new Response("Forbidden", { status: 403 });
    return env.ASSETS.fetch(request);
  },
};
