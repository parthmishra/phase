import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGameStore } from "../../../stores/gameStore.ts";
import { useMultiplayerStore } from "../../../stores/multiplayerStore.ts";
import { useUiStore } from "../../../stores/uiStore.ts";
import { gameObjectFactory } from "../../../test/factories/gameObjectFactory.ts";
import { gameStateFactory } from "../../../test/factories/gameStateFactory.ts";
import { PlayerHand } from "../PlayerHand.tsx";

vi.mock("../../../hooks/useEngineCardData.ts", () => ({
  useEngineCardData: () => null,
  useCardParseDetails: () => null,
  useCardRulings: () => [],
}));

describe("PlayerHand mobile lift", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    useMultiplayerStore.setState({ activePlayerId: 0 });
    useUiStore.setState({ inspectedObjectId: null });
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState({ gameState: null, spellCosts: {} });
    useUiStore.setState({ inspectedObjectId: null });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
  });

  it("lowers a tapped-up hand when the player next taps outside it", () => {
    const card = gameObjectFactory.withId(301).inHand().named("Mobile Card").build();
    const gameState = gameStateFactory
      .withPlayers({ id: 0, hand: [card.id] }, 1)
      .withObjects(card)
      .build();
    act(() => {
      useGameStore.setState({ gameState, spellCosts: {} });
    });

    const { container } = render(<PlayerHand />);
    const handLift = container.querySelector<HTMLElement>("[data-player-hand-lift]");
    const cardElement = container.querySelector<HTMLElement>("[data-hand-card]");
    expect(handLift).toHaveAttribute("data-player-hand-expanded", "false");
    expect(cardElement).not.toBeNull();
    expect(cardElement).toHaveAttribute("data-hand-hover-enabled", "false");

    fireEvent.click(cardElement!);
    expect(handLift).toHaveAttribute("data-player-hand-expanded", "true");

    fireEvent.pointerDown(document.body);
    expect(handLift).toHaveAttribute("data-player-hand-expanded", "false");
  });
});
