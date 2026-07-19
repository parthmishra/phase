// Sidecar lifecycle management for Tauri desktop builds.
//
// To set up the sidecar binary for development:
// cargo build --profile server-release -p phase-server
// cp target/server-release/phase-server client/src-tauri/binaries/phase-server-$(rustc --print host-tuple)

import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join, resolveResource } from "@tauri-apps/api/path";

const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_STARTUP_TIMEOUT_MS = 30_000;
const MAX_DIAGNOSTIC_LINES = 20;

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
  // Runtime state must not be written into the app bundle. That location is
  // read-only when running directly from a DMG or from a system installation.
  const stateDir = await join(await appLocalDataDir(), "sidecar");
  const logDir = await join(stateDir, "logs");

  const env: Record<string, string> = {
    PORT: String(port),
    PHASE_DATA_DIR: dataDir,
    PHASE_STATE_DIR: stateDir,
    PHASE_LOG_DIR: logDir,
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
  const diagnosticLines: string[] = [];
  let termination: string | null = null;
  const rememberOutput = (source: "stdout" | "stderr", line: string) => {
    diagnosticLines.push(`${source}: ${line}`);
    if (diagnosticLines.length > MAX_DIAGNOSTIC_LINES) {
      diagnosticLines.shift();
    }
  };
  command.stdout.on("data", (line) => rememberOutput("stdout", line));
  command.stderr.on("data", (line) => rememberOutput("stderr", line));
  command.on("error", (error) => {
    termination = `reported an error: ${error}`;
  });
  command.on("close", ({ code, signal }) => {
    termination = `exited with code ${String(code)} and signal ${String(signal)}`;
  });

  const child = await command.spawn();

  // Cold startup parses the bundled ~94 MB card database before binding the
  // listener. On macOS this routinely exceeds five seconds, so allow a bounded
  // 30-second startup window while still failing immediately if the process
  // exits or the shell reports an error.
  const maxAttempts = HEALTH_STARTUP_TIMEOUT_MS / HEALTH_POLL_INTERVAL_MS;
  for (let i = 0; i < maxAttempts; i++) {
    if (termination) {
      const output = diagnosticLines.length > 0
        ? `; recent output: ${diagnosticLines.join(" | ")}`
        : "";
      throw new Error(`Sidecar ${termination}${output}`);
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
    const healthy = await checkHealth(port);
    if (healthy) {
      return {
        port,
        kill: () => child.kill(),
      };
    }
  }

  // Timed out -- kill the process and throw
  await child.kill().catch(() => undefined);
  throw new Error(
    `Sidecar health check timed out after ${HEALTH_STARTUP_TIMEOUT_MS / 1000}s on port ${port}`,
  );
}

async function checkHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
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
