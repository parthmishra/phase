import assert from "node:assert/strict";
import test from "node:test";

import { proxyCompressedRuntimeAsset } from "./compressed-runtime-proxy.js";

const options = {
  assetPath: "/runtime-assets/engine.wasm.br.bin",
  r2ObjectForVersion: (version) => `wasm/engine-${version}.wasm`,
  contentType: "application/wasm",
};

function context({ asset, object, method = "GET" }) {
  return {
    request: new Request(
      "https://example.test/runtime/engine.wasm?v=0123456789abcdef",
      { method },
    ),
    env: {
      ASSETS: { fetch: async () => asset },
      RUNTIME_BUCKET: { get: async () => object },
    },
  };
}

test("uses R2 when Pages returns the SPA fallback for a missing asset", async () => {
  const response = await proxyCompressedRuntimeAsset(
    context({
      asset: new Response("<html>app shell</html>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
      object: { body: "r2-runtime" },
    }),
    options,
  );

  assert.equal(await response.text(), "r2-runtime");
  assert.equal(response.headers.get("Content-Type"), "application/wasm");
  assert.equal(response.headers.get("Content-Encoding"), "br");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("keeps using a packed Pages runtime asset when present", async () => {
  const response = await proxyCompressedRuntimeAsset(
    context({
      asset: new Response("packed-runtime", {
        headers: { "Content-Type": "application/octet-stream" },
      }),
      object: null,
    }),
    options,
  );

  assert.equal(await response.text(), "packed-runtime");
});

test("allows cross-origin runtime preflight requests", async () => {
  const response = await proxyCompressedRuntimeAsset(
    context({
      method: "OPTIONS",
      asset: new Response(null, { status: 404 }),
      object: null,
    }),
    options,
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, HEAD, OPTIONS",
  );
});
