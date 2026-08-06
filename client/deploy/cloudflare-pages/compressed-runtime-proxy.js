const RUNTIME_VERSION_PATTERN = /^[0-9a-f]{16}$/;

export async function proxyCompressedRuntimeAsset(
  context,
  { assetPath, r2ObjectForVersion, contentType },
) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const assetUrl = new URL(assetPath, context.request.url);
  const asset = await context.env.ASSETS.fetch(assetUrl);
  const assetContentType = asset.headers.get("Content-Type")?.toLowerCase();
  const isSpaFallback = assetContentType?.startsWith("text/html") ?? false;

  // Pages' SPA fallback returns index.html with status 200 for a missing
  // runtime asset. Treat that HTML response as a miss so R2-backed
  // deployments fetch the content-addressed object instead.
  let body = asset.ok && !isSpaFallback ? asset.body : null;
  if (body === null && context.env.RUNTIME_BUCKET !== undefined) {
    const version = new URL(context.request.url).searchParams.get("v");
    if (version === null || !RUNTIME_VERSION_PATTERN.test(version)) {
      return new Response("Invalid runtime version", { status: 400 });
    }
    const object = await context.env.RUNTIME_BUCKET.get(r2ObjectForVersion(version));
    if (object === null) {
      return new Response("Runtime asset unavailable", { status: 502 });
    }
    body = object.body;
  }
  if (body === null) {
    return new Response("Runtime asset unavailable", { status: 502 });
  }

  return new Response(body, {
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
