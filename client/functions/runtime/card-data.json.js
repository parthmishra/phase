import { proxyCompressedRuntimeAsset } from "../../deploy/cloudflare-pages/compressed-runtime-proxy.js";

export function onRequest(context) {
  return proxyCompressedRuntimeAsset(
    context,
    "/runtime-assets/card-data.json.br.bin",
    "application/json; charset=utf-8",
  );
}
