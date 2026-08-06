export async function proxyCompressedRuntimeAsset(context, assetPath, contentType) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const assetUrl = new URL(assetPath, context.request.url);
  const asset = await context.env.ASSETS.fetch(assetUrl);

  if (!asset.ok || asset.body == null) {
    return new Response("Runtime asset unavailable", { status: 502 });
  }

  return new Response(asset.body, {
    // The asset body is already Brotli encoded. Without manual encoding mode,
    // Workers may strip Content-Encoding while leaving the compressed bytes
    // untouched, which makes browsers parse Brotli data as JSON/WASM.
    encodeBody: "manual",
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Encoding": "br",
      "Content-Type": contentType,
      Vary: "Accept-Encoding",
    },
  });
}
