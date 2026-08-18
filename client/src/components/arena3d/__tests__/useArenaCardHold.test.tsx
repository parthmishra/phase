import { act, renderHook } from "@testing-library/react";
import type { ThreeEvent } from "@react-three/fiber";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARENA_CARD_HOLD_DELAY_MS,
  useArenaCardHold,
} from "../useArenaCardHold.ts";

function pointerEvent(
  overrides: Partial<PointerEvent> = {},
): ThreeEvent<PointerEvent> {
  return {
    button: 0,
    clientX: 20,
    clientY: 30,
    isPrimary: true,
    pointerId: 7,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: {
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    },
    ...overrides,
  } as unknown as ThreeEvent<PointerEvent>;
}

describe("useArenaCardHold", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("opens after the hold delay and consumes the follow-up click", () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useArenaCardHold({ onHold }));

    act(() => result.current.handlers.onPointerDown(pointerEvent()));
    act(() => vi.advanceTimersByTime(ARENA_CARD_HOLD_DELAY_MS));

    expect(onHold).toHaveBeenCalledTimes(1);
    expect(result.current.consumeClick()).toBe(true);
    expect(result.current.consumeClick()).toBe(false);
  });

  it("leaves a short press available to the card's normal click", () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useArenaCardHold({ onHold }));
    const down = pointerEvent();

    act(() => result.current.handlers.onPointerDown(down));
    act(() => result.current.handlers.onPointerUp(pointerEvent()));
    act(() => vi.advanceTimersByTime(ARENA_CARD_HOLD_DELAY_MS));

    expect(onHold).not.toHaveBeenCalled();
    expect(result.current.consumeClick()).toBe(false);
  });

  it("keeps a completed hold consumable after pointer capture is released", () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useArenaCardHold({ onHold }));
    const event = pointerEvent();

    act(() => result.current.handlers.onPointerDown(event));
    act(() => vi.advanceTimersByTime(ARENA_CARD_HOLD_DELAY_MS));
    act(() => result.current.handlers.onLostPointerCapture(event));

    expect(result.current.consumeClick()).toBe(true);
  });

  it("cancels when the pointer moves beyond the gesture threshold", () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useArenaCardHold({ onHold }));

    act(() => result.current.handlers.onPointerDown(pointerEvent()));
    act(() =>
      result.current.handlers.onPointerMove(
        pointerEvent({ clientX: 40, clientY: 30 }),
      ),
    );
    act(() => vi.advanceTimersByTime(ARENA_CARD_HOLD_DELAY_MS));

    expect(onHold).not.toHaveBeenCalled();
    expect(result.current.consumeClick()).toBe(false);
  });
});
