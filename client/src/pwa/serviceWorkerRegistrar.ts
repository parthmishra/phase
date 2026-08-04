import { registerSW } from "virtual:pwa-register";

/** Build-tool boundary kept separate so the PWA lifecycle can be unit tested
 * without requiring Vite's production-only virtual service-worker module. */
export const registerPwaServiceWorker = registerSW;
