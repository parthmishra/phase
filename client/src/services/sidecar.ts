// Sidecar lifecycle management for Tauri desktop builds.
//
// To set up the sidecar binary for development:
// cargo build --profile server-release -p phase-server
// cp target/server-release/phase-server client/src-tauri/binaries/phase-server-$(rustc --print host-tuple)

import { Command } from "@tauri-apps/plugin-shell";
import { resolveResource } from "@tauri-apps/api/path";

/** Check whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface SidecarHandle {
  port: number;
  kill: () => Promise<void>;
}

export interface SidecarLlmConfig {
  endpoint: string;
  model: string;
  token: string;
  apiKey?: string;
  apiStyle: "chat_completions" | "responses";
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
}

/** Module-level handle for cleanup on page unload. */
let activeSidecar: SidecarHandle | null = null;

/**
 * Spawn the phase-server sidecar binary on an available port.
 * Scans ports 9374-9383 and performs a health check before returning.
 */
export async function spawnSidecar(
  port = 9374,
  llm?: SidecarLlmConfig,
): Promise<SidecarHandle> {
  if (!isTauri()) {
    throw new Error("Sidecar is only available in Tauri desktop builds");
  }

  const maxPort = port + 10;
  let lastError: unknown;

  for (let tryPort = port; tryPort < maxPort; tryPort++) {
    // Check if port is already in use by trying a health check
    const alreadyRunning = await checkHealth(tryPort);
    if (alreadyRunning) {
      // An arbitrary existing phase-server was not started with this request's
      // ephemeral desktop token/provider configuration. Never send a private
      // game snapshot to it; choose another loopback port instead.
      if (llm) continue;
      // Server already running on this port -- reuse it
      const handle: SidecarHandle = {
        port: tryPort,
        kill: async () => {
          // Not our process to kill
        },
      };
      activeSidecar = handle;
      return handle;
    }

    try {
      const handle = await trySpawnOnPort(tryPort, llm);
      activeSidecar = handle;
      return handle;
    } catch (error) {
      lastError = error;
      // Port may be in use by something else, try next
      continue;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  throw new Error(`Failed to spawn sidecar on ports ${port}-${maxPort - 1}: ${detail}`);
}

async function trySpawnOnPort(port: number, llm?: SidecarLlmConfig): Promise<SidecarHandle> {
  // Resolve the bundled data directory so the server can load card-data.json
  const dataDir = await resolveResource("data");

  const env: Record<string, string> = {
    PORT: String(port),
    PHASE_DATA_DIR: dataDir,
  };
  if (llm) {
    env.PHASE_LLM_AI_ENDPOINT = llm.endpoint;
    env.PHASE_LLM_AI_MODEL = llm.model;
    env.PHASE_LLM_DESKTOP_TOKEN = llm.token;
    env.PHASE_LLM_AI_API_STYLE = llm.apiStyle;
    if (llm.apiKey) env.PHASE_LLM_AI_API_KEY = llm.apiKey;
    if (llm.reasoningEffort) {
      env.PHASE_LLM_AI_REASONING_EFFORT = llm.reasoningEffort;
      env.PHASE_LLM_AI_TIMEOUT_MS = "120000";
    }
  }

  const command = Command.sidecar("binaries/phase-server", [], { env });

  const child = await command.spawn();

  // Health check: poll /health every 500ms, up to 10 attempts (5s)
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(500);
    const healthy = await checkHealth(port);
    if (healthy) {
      return {
        port,
        kill: () => child.kill(),
      };
    }
  }

  // Timed out -- kill the process and throw
  await child.kill();
  throw new Error(`Sidecar health check timed out on port ${port}`);
}

async function checkHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stop a running sidecar. */
export async function stopSidecar(handle: SidecarHandle): Promise<void> {
  await handle.kill();
  if (activeSidecar === handle) {
    activeSidecar = null;
  }
}

/** Get the currently active sidecar handle, if any. */
export function getActiveSidecar(): SidecarHandle | null {
  return activeSidecar;
}
