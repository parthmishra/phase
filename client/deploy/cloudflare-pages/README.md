# Cloudflare Pages deployment

The reproducible entry point for this fork is:

```bash
./scripts/deploy-cf.sh phase-arena-3d
```

The script installs the locked frontend dependencies, generates the Arena
assets, builds branch-matched release WASM, builds the production client,
enforces Cloudflare Pages' 25 MiB per-file limit, deploys the Pages Functions,
and verifies the public runtime when it is hosted on Pages.

## Authentication

Wrangler needs its own Cloudflare credentials. A logged-in Cloudflare MCP
connector does not automatically authenticate Wrangler. Use an API token with
Cloudflare Pages Edit permission and set the account ID:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
```

Alternatively, keep those assignments in a mode-`0600` file outside the
repository and point the script at it:

```bash
export CLOUDFLARE_ENV_FILE=/absolute/path/to/cloudflare.env
```

R2 mode additionally needs Workers R2 Storage Edit permission.

## Runtime storage modes

`CF_RUNTIME_STORAGE` controls where the large engine artifacts live:

- `auto` (default): use R2 when the account supports it; otherwise fall back
  to Pages.
- `r2`: require an R2 bucket and public development URL.
- `pages`: use the known-working no-R2 path for this fork.

The current account does not have R2 enabled, so the checkpoint deployment is:

```bash
CF_RUNTIME_STORAGE=pages \
  ./scripts/deploy-cf.sh phase-arena-3d
```

Pages cannot accept the raw 27 MiB engine WASM or 98 MiB card database. In
`pages` mode the script Brotli-compresses both below the upload limit and stores
them as opaque static assets. The functions under `client/functions/runtime/`
stream those bodies with `Content-Encoding: br`; the response uses Workers'
manual encoding mode so Cloudflare does not strip the encoding header. The
client URLs include the source hashes as query parameters to prevent an older
runtime response from being reused after a deployment.

The remaining shared JSON data defaults to `https://data.phase-rs.dev`. Override
`SHARED_DATA_BASE_URL` to use another compatible host. Override
`PAGES_PUBLIC_URL` when deploying behind a custom Pages domain.

`SKIP_WASM_BUILD=1` is safe only when `client/src/wasm/engine_wasm_bg.wasm` was
just built from the current checkout. Pairing newer JavaScript glue with an old
WASM is known to stall AI games at the mulligan prompt.

## Known-working endpoint

The canonical deployment for this branch is:

<https://phase-arena-3d.pages.dev>

The script verifies that the publicly decoded WASM and card database match the
local build byte-for-byte before it reports success.
