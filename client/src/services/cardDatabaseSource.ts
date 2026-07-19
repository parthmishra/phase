/**
 * Fetch the engine card database from the runtime-specific URL selected by
 * Vite. Keeping this on the window thread matters in packaged Tauri builds:
 * WKWebView workers cannot reliably fetch Tauri's custom `tauri:` protocol,
 * while the owning WebView can fetch bundled frontend assets normally.
 */
export async function fetchCardDatabaseText(): Promise<string> {
  const response = await fetch(__CARD_DATA_URL__);
  if (!response.ok) {
    throw new Error(`Failed to load card-data.json (${response.status})`);
  }
  return response.text();
}
