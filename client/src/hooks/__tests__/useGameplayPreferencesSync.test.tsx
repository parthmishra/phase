import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngineAdapter, GameState } from "../../adapter/types";
import { dispatchAction } from "../../game/dispatch";
import { useGameplayPreferencesSync } from "../useGameplayPreferencesSync";
import {
  nextGameSessionGeneration,
  useGameStore,
} from "../../stores/gameStore";
import { usePreferencesStore } from "../../stores/preferencesStore";

vi.mock("../../game/dispatch", () => ({ dispatchAction: vi.fn() }));

const adapter = {} as EngineAdapter;
const gameState = {} as GameState;

describe("useGameplayPreferencesSync", () => {
  beforeEach(() => {
    vi.mocked(dispatchAction).mockClear();
    usePreferencesStore.setState({
      phaseStops: [],
      priorityPassingMode: "Standard",
    });
    useGameStore.setState({
      adapter: null,
      gameState: null,
      engineCommitEpoch: 0,
      gameSessionGeneration: nextGameSessionGeneration(),
    });
  });

  afterEach(() => cleanup());

  it("waits for an installed snapshot, dedupes, and resends for a fresh lifecycle", async () => {
    renderHook(() => useGameplayPreferencesSync());

    act(() => {
      useGameStore.setState({ adapter });
    });
    expect(dispatchAction).not.toHaveBeenCalled();

    act(() => {
      useGameStore.setState({ gameState, engineCommitEpoch: 1 });
    });
    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(2));
    expect(dispatchAction).toHaveBeenNthCalledWith(1, {
      type: "SetPhaseStops",
      data: { stops: [] },
    });
    expect(dispatchAction).toHaveBeenNthCalledWith(2, {
      type: "SetPriorityPassingMode",
      data: { mode: "Standard" },
    });

    act(() => {
      useGameStore.setState({ engineCommitEpoch: 2 });
    });
    expect(dispatchAction).toHaveBeenCalledTimes(2);

    act(() => {
      usePreferencesStore.getState().setPhaseStops([]);
      usePreferencesStore.getState().setPriorityPassingMode("Standard");
    });
    expect(dispatchAction).toHaveBeenCalledTimes(2);

    act(() => usePreferencesStore.getState().setPriorityPassingMode("SkipLowUseWindows"));
    await waitFor(() => {
      expect(dispatchAction).toHaveBeenLastCalledWith({
        type: "SetPriorityPassingMode",
        data: { mode: "SkipLowUseWindows" },
      });
      expect(dispatchAction).toHaveBeenCalledTimes(3);
    });

    const firstGeneration = useGameStore.getState().gameSessionGeneration;
    act(() => {
      useGameStore.setState({ gameSessionGeneration: nextGameSessionGeneration() });
    });
    expect(useGameStore.getState().gameSessionGeneration).toBeGreaterThan(firstGeneration);
    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(5));

    const secondGeneration = useGameStore.getState().gameSessionGeneration;
    act(() => {
      useGameStore.setState({ gameSessionGeneration: nextGameSessionGeneration() });
    });
    expect(useGameStore.getState().gameSessionGeneration).toBeGreaterThan(secondGeneration);
    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(7));
  });

  it("retries rejected sends without duplicating successful preferences", async () => {
    vi.mocked(dispatchAction)
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    useGameStore.setState({ adapter, gameState, engineCommitEpoch: 1 });
    renderHook(() => useGameplayPreferencesSync());

    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(1));

    act(() => usePreferencesStore.getState().setPhaseStops([]));
    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(3));
    expect(dispatchAction).toHaveBeenNthCalledWith(2, {
      type: "SetPhaseStops",
      data: { stops: [] },
    });
    expect(dispatchAction).toHaveBeenNthCalledWith(3, {
      type: "SetPriorityPassingMode",
      data: { mode: "Standard" },
    });

    act(() => usePreferencesStore.getState().setPhaseStops([]));
    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(3));
  });
});
