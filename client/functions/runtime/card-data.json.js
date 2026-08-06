import { proxyCompressedRuntimeAsset } from "../../deploy/cloudflare-pages/compressed-runtime-proxy.js";

export function onRequest(context) {
  return proxyCompressedRuntimeAsset(context, {
    assetPath: "/runtime-assets/card-data.json.br.bin",
    r2ObjectForVersion: (version) => `card-data-${version}.json`,
    contentType: "application/json; charset=utf-8",
  });
}
