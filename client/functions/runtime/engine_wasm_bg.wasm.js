import { proxyCompressedRuntimeAsset } from "../../deploy/cloudflare-pages/compressed-runtime-proxy.js";

export function onRequest(context) {
  return proxyCompressedRuntimeAsset(
    context,
    "/runtime-assets/engine_wasm_bg.wasm.br.bin",
    "application/wasm",
  );
}
