#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_NAME="${1:-${CF_PAGES_PROJECT:-phase-arena-3d}}"
R2_BUCKET="${R2_BUCKET:-phase-arena-3d-data}"
R2_PUBLIC_URL="${R2_PUBLIC_URL:-}"
CF_RUNTIME_STORAGE="${CF_RUNTIME_STORAGE:-auto}"
CF_PAGES_BRANCH="${CF_PAGES_BRANCH:-codex/arena-3d-experiment}"
PAGES_PUBLIC_URL="${PAGES_PUBLIC_URL:-https://$PROJECT_NAME.pages.dev}"
SHARED_DATA_BASE_URL="${SHARED_DATA_BASE_URL:-https://data.phase-rs.dev}"
SKIP_WASM_BUILD="${SKIP_WASM_BUILD:-0}"
CF_COMPATIBILITY_DATE="${CF_COMPATIBILITY_DATE:-2026-08-06}"
CLOUDFLARE_ENV_FILE="${CLOUDFLARE_ENV_FILE:-}"

for tool in brotli cargo curl jq pnpm; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "ERROR: missing required tool: $tool" >&2
    exit 1
  }
done

wrangler() {
  if [ -n "$CLOUDFLARE_ENV_FILE" ]; then
    (cd client && pnpm exec wrangler --env-file "$CLOUDFLARE_ENV_FILE" "$@")
  else
    (cd client && pnpm exec wrangler "$@")
  fi
}

hash16() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -c1-16
  else
    shasum -a 256 "$1" | cut -c1-16
  fi
}

if [ -n "$CLOUDFLARE_ENV_FILE" ] && [ ! -r "$CLOUDFLARE_ENV_FILE" ]; then
  echo "ERROR: CLOUDFLARE_ENV_FILE is not readable: $CLOUDFLARE_ENV_FILE" >&2
  exit 1
fi

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID is required with CLOUDFLARE_API_TOKEN." >&2
  exit 1
fi

case "$CF_RUNTIME_STORAGE" in
  auto | r2 | pages) ;;
  *)
    echo "ERROR: CF_RUNTIME_STORAGE must be auto, r2, or pages (got: $CF_RUNTIME_STORAGE)." >&2
    exit 1
    ;;
esac

if ! pages_projects=$(wrangler pages project list --json); then
  cat >&2 <<'EOF'
ERROR: Wrangler could not authenticate with the Cloudflare Pages API.

Browser OAuth is unreliable in headless workspaces because its localhost
callback cannot reach Wrangler and Cloudflare may challenge the token exchange.
Use an API token with Pages Edit permission. R2 Storage Edit is additionally
required only when CF_RUNTIME_STORAGE=r2 (or auto selects R2):

  export CLOUDFLARE_API_TOKEN=...
  export CLOUDFLARE_ACCOUNT_ID=...

Or put those two assignments in a private file outside the repository and set:

  export CLOUDFLARE_ENV_FILE=/absolute/path/to/cloudflare.env
EOF
  exit 1
fi

prepare_r2() {
  if ! wrangler r2 bucket info "$R2_BUCKET" >/dev/null 2>&1; then
    echo "Creating R2 bucket: $R2_BUCKET"
    if ! wrangler r2 bucket create "$R2_BUCKET"; then
      return 1
    fi
  fi

  if [ -z "$R2_PUBLIC_URL" ]; then
    local dev_url_output
    dev_url_output=$(wrangler r2 bucket dev-url get "$R2_BUCKET" 2>&1 || true)
    R2_PUBLIC_URL=$(printf '%s\n' "$dev_url_output" \
      | grep -Eo 'https://[^[:space:]]+\.r2\.dev' \
      | head -1 || true)
    if [ -z "$R2_PUBLIC_URL" ]; then
      echo "Enabling the R2 development URL for live testing..."
      if ! wrangler r2 bucket dev-url enable "$R2_BUCKET" --force; then
        return 1
      fi
      dev_url_output=$(wrangler r2 bucket dev-url get "$R2_BUCKET")
      R2_PUBLIC_URL=$(printf '%s\n' "$dev_url_output" \
        | grep -Eo 'https://[^[:space:]]+\.r2\.dev' \
        | head -1 || true)
    fi
  fi
  R2_PUBLIC_URL="${R2_PUBLIC_URL%/}"
  if [ -z "$R2_PUBLIC_URL" ]; then
    echo "ERROR: could not determine the public R2 URL." >&2
    return 1
  fi

  echo "Configuring read-only browser access for $R2_BUCKET..."
  wrangler r2 bucket cors set "$R2_BUCKET" \
    --file deploy/cloudflare-pages/r2-cors.json --force
}

RUNTIME_STORAGE="$CF_RUNTIME_STORAGE"
if [ "$RUNTIME_STORAGE" = "auto" ]; then
  if prepare_r2; then
    RUNTIME_STORAGE="r2"
  else
    RUNTIME_STORAGE="pages"
    echo "R2 is unavailable; using compressed Cloudflare Pages runtime assets."
  fi
elif [ "$RUNTIME_STORAGE" = "r2" ]; then
  if ! prepare_r2; then
    echo "ERROR: R2 runtime storage was requested but could not be prepared." >&2
    echo "Use CF_RUNTIME_STORAGE=pages when R2 is not enabled on the account." >&2
    exit 1
  fi
fi

echo "Installing frontend dependencies and generating Arena assets..."
(cd client && pnpm install --frozen-lockfile && pnpm arena:assets)

if [ "$SKIP_WASM_BUILD" != "1" ]; then
  echo "Building optimized WASM..."
  CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}" ./scripts/build-wasm.sh release
fi

CARD_DATA_SOURCE="client/public/card-data.json"
ENGINE_WASM_SOURCE="client/src/wasm/engine_wasm_bg.wasm"
for file in "$CARD_DATA_SOURCE" "$ENGINE_WASM_SOURCE"; do
  if [ ! -s "$file" ]; then
    echo "ERROR: required build artifact is missing: $file" >&2
    echo "Run ./scripts/setup.sh --no-tilt first." >&2
    exit 1
  fi
done

CARD_DATA_HASH=$(hash16 "$CARD_DATA_SOURCE")
ENGINE_WASM_HASH=$(hash16 "$ENGINE_WASM_SOURCE")
CARD_DATA_OBJECT="card-data-$CARD_DATA_HASH.json"
ENGINE_WASM_OBJECT="wasm/engine_wasm_bg-$ENGINE_WASM_HASH.wasm"
DEPLOY_TMP=$(mktemp -d)
trap 'rm -rf "$DEPLOY_TMP"' EXIT

upload_json() {
  local source="$1" object="$2" cache_control="$3"
  local compressed="$DEPLOY_TMP/${object//\//_}.br"
  echo "  ^ $object"
  brotli -q 7 -c "$source" > "$compressed"
  wrangler r2 object put "$R2_BUCKET/$object" \
    --file "$compressed" \
    --content-type application/json \
    --content-encoding br \
    --cache-control "$cache_control" \
    --remote
}

verify_public_object() {
  local object="$1" headers attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    headers=$(curl -fsSI -H "Origin: https://$PROJECT_NAME.pages.dev" \
      "$R2_PUBLIC_URL/$object" 2>/dev/null || true)
    if grep -qi '^access-control-allow-origin:' <<< "$headers"; then
      return 0
    fi
    sleep 2
  done
  echo "ERROR: public R2 object or its CORS headers are unavailable: $object" >&2
  return 1
}

if [ "$RUNTIME_STORAGE" = "r2" ]; then
  echo "Uploading branch-matched runtime artifacts to $R2_PUBLIC_URL..."
  upload_json "$CARD_DATA_SOURCE" "$CARD_DATA_OBJECT" \
    "public, max-age=31536000, immutable"
  wrangler r2 object put "$R2_BUCKET/$ENGINE_WASM_OBJECT" \
    --file "../$ENGINE_WASM_SOURCE" \
    --content-type application/wasm \
    --cache-control "public, max-age=31536000, immutable" \
    --remote

  while IFS= read -r filename; do
    source="client/public/$filename"
    if [ ! -s "$source" ]; then
      echo "ERROR: data-files.json entry is missing: $source" >&2
      exit 1
    fi
    upload_json "$source" "$filename" "public, max-age=60, must-revalidate"
  done < <(jq -r '.[]' data-files.json)

  echo "Verifying public R2 access and CORS..."
  verify_public_object "$CARD_DATA_OBJECT"
  verify_public_object "$ENGINE_WASM_OBJECT"

  export DATA_BASE_URL="$R2_PUBLIC_URL"
  export CARD_DATA_URL="$R2_PUBLIC_URL/$CARD_DATA_OBJECT"
  export ENGINE_WASM_URL="$R2_PUBLIC_URL/$ENGINE_WASM_OBJECT"
else
  PAGES_PUBLIC_URL="${PAGES_PUBLIC_URL%/}"
  SHARED_DATA_BASE_URL="${SHARED_DATA_BASE_URL%/}"
  export DATA_BASE_URL="$SHARED_DATA_BASE_URL"
  export CARD_DATA_URL="$PAGES_PUBLIC_URL/runtime/card-data.json?v=$CARD_DATA_HASH"
  export ENGINE_WASM_URL="$PAGES_PUBLIC_URL/runtime/engine_wasm_bg.wasm?v=$ENGINE_WASM_HASH"
fi

echo "Building deployable frontend..."
echo "  DATA_BASE_URL=$DATA_BASE_URL"
echo "  CARD_DATA_URL=$CARD_DATA_URL"
echo "  ENGINE_WASM_URL=$ENGINE_WASM_URL"
(cd client && pnpm build)

if [ "$RUNTIME_STORAGE" = "pages" ]; then
  echo "Packing branch-matched runtime artifacts for Cloudflare Pages..."
  mkdir -p client/dist/runtime-assets
  brotli -f -q 7 -o client/dist/runtime-assets/card-data.json.br.bin \
    "$CARD_DATA_SOURCE"
  brotli -f -q 7 -o client/dist/runtime-assets/engine_wasm_bg.wasm.br.bin \
    "$ENGINE_WASM_SOURCE"
fi

# The external URLs above are compiled into the app. Vite still copies public/
# wholesale, so remove those externally served copies before enforcing Pages'
# 25 MiB per-file limit. In Pages runtime mode, only the branch-matched engine
# and card database are hosted by this project; the remaining shared data uses
# SHARED_DATA_BASE_URL (the official data host by default).
while IFS= read -r filename; do
  rm -f "client/dist/$filename" "client/dist/$filename.br"
done < <(jq -r '.[]' data-files.json)
rm -f client/dist/card-data.json client/dist/card-data.json.br
rm -f client/dist/card-data-????????????????.json
rm -f client/dist/card-data-????????????????.json.br
cp client/deploy/cloudflare-pages/_headers client/dist/_headers
cp client/deploy/cloudflare-pages/_routes.json client/dist/_routes.json

oversized=$(find client/dist -type f -size +25M -print -quit)
if [ -n "$oversized" ]; then
  echo "ERROR: Cloudflare Pages 25 MiB file limit exceeded: $oversized" >&2
  du -h "$oversized" >&2
  exit 1
fi

if ! jq -e --arg name "$PROJECT_NAME" \
  '(if type == "array" then . else (.projects // .result // []) end)[]
   | select((.name // .project_name // ."Project Name") == $name)' \
  <<< "$pages_projects" >/dev/null; then
  echo "Creating Cloudflare Pages project: $PROJECT_NAME"
  wrangler pages project create "$PROJECT_NAME" \
    --production-branch "$CF_PAGES_BRANCH" \
    --compatibility-date "$CF_COMPATIBILITY_DATE"
fi

echo "Deploying $PROJECT_NAME to Cloudflare Pages..."
wrangler pages deploy dist \
  --project-name "$PROJECT_NAME" \
  --branch "$CF_PAGES_BRANCH" \
  --commit-hash "$(RTK_DISABLED=1 git rev-parse HEAD)" \
  --commit-dirty=true

verify_pages_runtime() {
  local live_engine="$DEPLOY_TMP/live-engine.wasm"
  local live_card_data="$DEPLOY_TMP/live-card-data.json"
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --compressed "$ENGINE_WASM_URL" -o "$live_engine" \
      && curl -fsS --compressed "$CARD_DATA_URL" -o "$live_card_data" \
      && cmp -s "$ENGINE_WASM_SOURCE" "$live_engine" \
      && cmp -s "$CARD_DATA_SOURCE" "$live_card_data"; then
      return 0
    fi
    sleep 2
  done
  echo "ERROR: deployed Pages runtime does not match the local branch artifacts." >&2
  return 1
}

if [ "$RUNTIME_STORAGE" = "pages" ]; then
  echo "Verifying deployed Pages runtime hashes..."
  verify_pages_runtime
fi

echo "Deployment complete: $PAGES_PUBLIC_URL"
echo "Runtime storage: $RUNTIME_STORAGE"
