import { proxyCompressedRuntimeAsset } from "../../deploy/cloudflare-pages/compressed-runtime-proxy.js";

export function onRequest(context) {
  return proxyCompressedRuntimeAsset(context, {
    assetPath: "/runtime-assets/engine_wasm_bg.wasm.br.bin",
    r2ObjectForVersion: (version) =>
      `wasm/engine_wasm_bg-${version}.wasm`,
    contentType: "application/wasm",
  });
}
