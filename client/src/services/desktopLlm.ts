import type { GameAction, GameState } from "../adapter/types";
import { spawnSidecar, type SidecarHandle } from "./sidecar";

const STORAGE_KEY = "phase-desktop-llm-config";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export type DesktopLlmProvider = "local" | "openai";
export type DesktopLlmReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export interface DesktopLlmConfig {
  provider: DesktopLlmProvider;
  endpoint: string;
  model: string;
  reasoningEffort: DesktopLlmReasoningEffort;
}

interface DesktopLlmResponse {
  action: GameAction;
  plan?: string;
  usedProvider: boolean;
}

const DEFAULT_CONFIG: DesktopLlmConfig = {
  provider: "local",
  endpoint: "http://127.0.0.1:11434/v1/chat/completions",
  model: "qwen2.5:14b",
  reasoningEffort: "medium",
};

const PROVIDERS = new Set<DesktopLlmProvider>(["local", "openai"]);
const REASONING_EFFORTS = new Set<DesktopLlmReasoningEffort>([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

let runtime: { sidecar: SidecarHandle; token: string; fingerprint: string } | null = null;
let apiKey: string | undefined;
const plans = new Map<number, string>();

export function loadDesktopLlmConfig(): DesktopLlmConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<DesktopLlmConfig> | null;
    return {
      provider: PROVIDERS.has(parsed?.provider as DesktopLlmProvider)
        ? (parsed?.provider as DesktopLlmProvider)
        : DEFAULT_CONFIG.provider,
      endpoint: parsed?.endpoint?.trim() || DEFAULT_CONFIG.endpoint,
      model: parsed?.model?.trim() || DEFAULT_CONFIG.model,
      reasoningEffort: REASONING_EFFORTS.has(parsed?.reasoningEffort as DesktopLlmReasoningEffort)
        ? (parsed?.reasoningEffort as DesktopLlmReasoningEffort)
        : DEFAULT_CONFIG.reasoningEffort,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveDesktopLlmConfig(config: DesktopLlmConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Keep provider credentials in memory only; they are passed directly to the
 * child sidecar environment and never written to localStorage. */
export function setDesktopLlmApiKey(value: string): void {
  apiKey = value.trim() || undefined;
}

async function ensureRuntime(): Promise<{ sidecar: SidecarHandle; token: string }> {
  const config = loadDesktopLlmConfig();
  const endpoint = new URL(
    config.provider === "openai" ? OPENAI_RESPONSES_ENDPOINT : config.endpoint,
  );
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("LLM endpoint must use HTTP or HTTPS");
  }
  if (!config.model.trim()) throw new Error("LLM model is required");
  if (config.provider === "openai" && !apiKey) {
    throw new Error("An OpenAI API key is required");
  }
  const apiStyle = config.provider === "openai" ? "responses" : "chat_completions";
  const reasoningEffort = config.provider === "openai" ? config.reasoningEffort : undefined;
  const fingerprint = JSON.stringify([
    endpoint.toString(),
    config.model.trim(),
    apiStyle,
    reasoningEffort,
    apiKey ?? null,
  ]);
  if (runtime?.fingerprint === fingerprint) return runtime;
  if (runtime) {
    await runtime.sidecar.kill();
    runtime = null;
    plans.clear();
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const sidecar = await spawnSidecar(9374, {
    endpoint: endpoint.toString(),
    model: config.model.trim(),
    token,
    apiKey,
    apiStyle,
    reasoningEffort,
  });
  runtime = { sidecar, token, fingerprint };
  return runtime;
}

export async function chooseDesktopLlmAction(
  state: GameState,
  submitter: number,
): Promise<GameAction> {
  const { sidecar, token } = await ensureRuntime();
  const response = await fetch(`http://127.0.0.1:${sidecar.port}/desktop/llm-decision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state,
      submitter,
      previousPlan: plans.get(submitter),
    }),
  });
  if (!response.ok) {
    throw new Error(`Desktop LLM sidecar returned HTTP ${response.status}`);
  }
  const decision = (await response.json()) as DesktopLlmResponse;
  if (!decision.action || typeof decision.action.type !== "string") {
    throw new Error("Desktop LLM sidecar returned no action");
  }
  if (decision.usedProvider) {
    if (decision.plan) plans.set(submitter, decision.plan);
    const config = loadDesktopLlmConfig();
    console.info("[LLM] Action selected by model", {
      player: submitter,
      provider: config.provider,
      model: config.model,
      reasoningEffort: config.provider === "openai" ? config.reasoningEffort : undefined,
      action: decision.action,
      plan: decision.plan ?? null,
    });
  }
  return decision.action;
}

export function clearDesktopLlmPlans(): void {
  plans.clear();
}
