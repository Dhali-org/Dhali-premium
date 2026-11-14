# Cloudflare Worker: static premium content

Serves files from `premium-content/` only to requests forwarded by the Dhali proxy. There's no server to run.

## Deploy

```sh
cd examples/cloudflare-worker
# Add your premium HTML fragments (or .json files) to premium-content/
npx wrangler secret put DHALI_SECRET   # paste the header secret value
npx wrangler deploy
```

1. In app.dhali.io, register the Worker's URL (e.g. `https://my-premium-content.<account>.workers.dev`) as your API's base URL. Use the same header name as `SECRET_HEADER` in `wrangler.jsonc`, and the value you stored as `DHALI_SECRET`.
2. Add a section to your page. The `path` is the file's path inside `premium-content/`:

```html
<dhali-premium api="YOUR-API-ID" path="/example.html">
  <p>Teaser…</p>
</dhali-premium>
```

## Check it

```sh
curl -i https://my-premium-content.<account>.workers.dev/example.html
# 403 Forbidden: requests that skip Dhali are refused
```

`run_worker_first` in `wrangler.jsonc` makes the secret check run before any file is served. Without it, Cloudflare would serve the files directly.
