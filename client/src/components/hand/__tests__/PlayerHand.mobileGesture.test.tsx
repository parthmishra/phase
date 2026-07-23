import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameAction } from "../../../adapter/types.ts";
import { useGameStore } from "../../../stores/gameStore.ts";
import { useMultiplayerStore } from "../../../stores/multiplayerStore.ts";
import { usePreferencesStore } from "../../../stores/preferencesStore.ts";
import { useUiStore } from "../../../stores/uiStore.ts";
import { gameObjectFactory } from "../../../test/factories/gameObjectFactory.ts";
import { gameStateFactory } from "../../../test/factories/gameStateFactory.ts";
import { setGameStoreForTest } from "../../../test/helpers/gameStoreHelpers.ts";
import { PlayerHand } from "../PlayerHand.tsx";

const { mockDispatchAction } = vi.hoisted(() => ({
  mockDispatchAction: vi.fn(),
}));

vi.mock("../../../game/dispatch.ts", () => ({
  dispatchAction: mockDispatchAction,
}));

vi.mock("../../../hooks/useCardImage.ts", () => ({
  useCardImage: () => ({
    src: "card.png",
    isLoading: false,
    isRotated: false,
    isFlip: false,
  }),
}));

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

function renderMobileHand(actions: GameAction[]) {
  const card = gameObjectFactory
    .land()
    .inHand()
    .withId(311)
    .named("Mobile Test Land")
    .build();
  const gameState = gameStateFactory
    .withPlayers({ id: 0, hand: [card.id] }, 1)
    .withObjects(card)
    .priority(0)
    .build();

  setGameStoreForTest({
    gameState,
    waitingFor: gameState.waiting_for,
    legalActions: actions,
    legalActionsByObject: { [card.id]: actions },
    gameMode: "local",
    spellCosts: {},
  });

  const rendered = render(<PlayerHand />);
  const hand = rendered.container.firstElementChild as HTMLElement | null;
  const source = rendered.container.querySelector<HTMLElement>(
    `[data-hand-card][data-object-id="${card.id}"]`,
  );
  expect(hand).not.toBeNull();
  expect(source).not.toBeNull();
  if (!hand || !source) throw new Error("PlayerHand did not render its mobile hand surface");

  hand.getBoundingClientRect = () => rect(0, 200);
  source.getBoundingClientRect = () => rect(0, 100);
  return { card, hand, source };
}

function holdLiftAndRelease(
  hand: HTMLElement,
  source: HTMLElement,
  pointerId: number,
) {
  fireEvent.pointerDown(hand, {
    button: 0,
    clientX: 40,
    clientY: 100,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });
  act(() => vi.advanceTimersByTime(400));
  expect(source).toHaveAttribute("data-hand-touch-active", "true");

  fireEvent.pointerMove(hand, {
    clientX: 52,
    clientY: 10,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });
  fireEvent.pointerUp(hand, {
    button: 0,
    clientX: 52,
    clientY: 10,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });
}

const originalInnerWidth = window.innerWidth;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  useMultiplayerStore.setState({ activePlayerId: null, isSpectator: false });
  usePreferencesStore.setState({ handSort: "none" });
  useUiStore.setState({
    handFilter: "none",
    mobileHandGesture: null,
    mobileHandOpen: false,
    pendingAbilityChoice: null,
  });
});

afterEach(() => {
  cleanup();
  useGameStore.setState({
    gameState: null,
    waitingFor: null,
    legalActions: [],
    legalActionsByObject: {},
    gameMode: null,
    spellCosts: {},
  });
  useUiStore.setState({
    handFilter: "none",
    mobileHandGesture: null,
    mobileHandOpen: false,
    pendingAbilityChoice: null,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("PlayerHand mobile release-to-cast wiring", () => {
  it("dispatches the one direct engine-provided play action", () => {
    const playLandAction: GameAction = {
      type: "PlayLand",
      data: { object_id: 311, card_id: 311 },
    };
    const { hand, source } = renderMobileHand([playLandAction]);

    holdLiftAndRelease(hand, source, 41);

    expect(mockDispatchAction).toHaveBeenCalledOnce();
    expect(mockDispatchAction).toHaveBeenCalledWith(playLandAction);
    expect(useUiStore.getState().mobileHandOpen).toBe(false);
  });

  it("keeps an ambiguous action bucket on the tap-to-open hand-modal path", () => {
    const playLandAction: GameAction = {
      type: "PlayLand",
      data: { object_id: 311, card_id: 311 },
    };
    const alternateAction: GameAction = {
      type: "ActivateAbility",
      data: { source_id: 311, ability_index: 0 },
    };
    const { hand } = renderMobileHand([
      playLandAction,
      alternateAction,
    ]);

    fireEvent.pointerDown(hand, {
      button: 0,
      clientX: 40,
      clientY: 100,
      isPrimary: true,
      pointerId: 42,
      pointerType: "touch",
    });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerMove(hand, {
      clientX: 52,
      clientY: 10,
      isPrimary: true,
      pointerId: 42,
      pointerType: "touch",
    });

    expect(useUiStore.getState().mobileHandGesture).toMatchObject({
      objectId: 311,
      phase: "drag",
      playable: true,
      castReady: false,
    });

    fireEvent.pointerUp(hand, {
      button: 0,
      clientX: 52,
      clientY: 10,
      isPrimary: true,
      pointerId: 42,
      pointerType: "touch",
    });
    expect(mockDispatchAction).not.toHaveBeenCalled();

    fireEvent.pointerDown(hand, {
      button: 0,
      clientX: 40,
      clientY: 100,
      isPrimary: true,
      pointerId: 43,
      pointerType: "touch",
    });
    fireEvent.pointerUp(hand, {
      button: 0,
      clientX: 40,
      clientY: 100,
      isPrimary: true,
      pointerId: 43,
      pointerType: "touch",
    });
    fireEvent.click(hand);

    expect(useUiStore.getState().mobileHandOpen).toBe(true);
    expect(mockDispatchAction).not.toHaveBeenCalled();
  });
});
