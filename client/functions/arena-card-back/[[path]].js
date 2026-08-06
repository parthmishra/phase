import { proxyArenaImage } from "../../deploy/cloudflare-pages/arena-image-proxy.js";

export function onRequest(context) {
  return proxyArenaImage(context, "https://backs.scryfall.io");
}
