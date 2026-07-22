import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUiStore } from "../../../stores/uiStore.ts";
import { useHandScrubPreview } from "../useHandScrubPreview.ts";

function rect(left: number, right: number): DOMRect {
  return {
    bottom: 180,
    height: 140,
    left,
    right,
    top: 40,
    width: right - left,
    x: left,
    y: 40,
    toJSON: () => ({}),
  } as DOMRect;
}

function ScrubHarness({ onOpen }: { onOpen: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { handlers, consumeClick } = useHandScrubPreview(ref, true);

  return (
    <div
      ref={ref}
      data-testid="hand"
      {...handlers}
      onClick={() => {
        if (!consumeClick()) onOpen();
      }}
    >
      <div data-testid="card-11" data-hand-card data-object-id="11" />
      <div data-testid="card-12" data-hand-card data-object-id="12" />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useUiStore.getState().dismissPreview();
});

describe("useHandScrubPreview", () => {
  it("holds to preview, scrubs adjacent cards, and suppresses the release click", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<ScrubHarness onOpen={onOpen} />);
    const hand = screen.getByTestId("hand");
    const first = screen.getByTestId("card-11");
    const second = screen.getByTestId("card-12");
    first.getBoundingClientRect = () => rect(0, 100);
    second.getBoundingClientRect = () => rect(70, 170);

    fireEvent.pointerDown(hand, {
      button: 0,
      clientX: 40,
      clientY: 100,
      isPrimary: true,
      pointerId: 7,
      pointerType: "touch",
    });
    act(() => vi.advanceTimersByTime(400));

    expect(useUiStore.getState().inspectedObjectId).toBe(11);
    expect(useUiStore.getState().previewSticky).toBe(true);
    expect(first).toHaveAttribute("data-hand-touch-active", "true");

    fireEvent.pointerMove(hand, {
      clientX: 140,
      clientY: 100,
      isPrimary: true,
      pointerId: 7,
      pointerType: "touch",
    });

    expect(useUiStore.getState().inspectedObjectId).toBe(12);
    expect(first).not.toHaveAttribute("data-hand-touch-active");
    expect(second).toHaveAttribute("data-hand-touch-active", "true");

    fireEvent.pointerUp(hand, {
      button: 0,
      clientX: 140,
      clientY: 100,
      isPrimary: true,
      pointerId: 7,
      pointerType: "touch",
    });
    fireEvent.click(hand);

    expect(useUiStore.getState().inspectedObjectId).toBeNull();
    expect(second).not.toHaveAttribute("data-hand-touch-active");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps a short tap available for opening the hand drawer", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<ScrubHarness onOpen={onOpen} />);
    const hand = screen.getByTestId("hand");

    fireEvent.pointerDown(hand, {
      button: 0,
      clientX: 40,
      clientY: 100,
      isPrimary: true,
      pointerId: 8,
      pointerType: "touch",
    });
    fireEvent.pointerUp(hand, {
      button: 0,
      clientX: 40,
      clientY: 100,
      isPrimary: true,
      pointerId: 8,
      pointerType: "touch",
    });
    fireEvent.click(hand);

    expect(onOpen).toHaveBeenCalledOnce();
    expect(useUiStore.getState().inspectedObjectId).toBeNull();
  });

  it("does not consume a long tap that starts outside a card", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<ScrubHarness onOpen={onOpen} />);
    const hand = screen.getByTestId("hand");
    const first = screen.getByTestId("card-11");
    const second = screen.getByTestId("card-12");
    first.getBoundingClientRect = () => rect(0, 100);
    second.getBoundingClientRect = () => rect(70, 170);

    fireEvent.pointerDown(hand, {
      button: 0,
      clientX: 240,
      clientY: 100,
      isPrimary: true,
      pointerId: 9,
      pointerType: "touch",
    });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerUp(hand, {
      button: 0,
      clientX: 240,
      clientY: 100,
      isPrimary: true,
      pointerId: 9,
      pointerType: "touch",
    });
    fireEvent.click(hand);

    expect(onOpen).toHaveBeenCalledOnce();
    expect(useUiStore.getState().inspectedObjectId).toBeNull();
  });
});
