import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameAction } from "../../../adapter/types.ts";
import { useGameStore } from "../../../stores/gameStore.ts";
import { gameObjectFactory } from "../../../test/factories/gameObjectFactory.ts";
import { gameStateFactory } from "../../../test/factories/gameStateFactory.ts";
import { PlayerHand } from "../PlayerHand.tsx";

vi.mock("../../../hooks/useCardImage.ts", () => ({
  useCardImage: () => ({
    src: null,
    isLoading: false,
    isRotated: false,
    isFlip: false,
  }),
}));

vi.mock("../../../hooks/useEngineCardData.ts", () => ({
  useEngineCardData: () => null,
}));

afterEach(() => {
  cleanup();
  useGameStore.setState({
    gameState: null,
    waitingFor: null,
    legalActionsByObject: {},
    spellCosts: {},
  });
});

describe("PlayerHand playable edge", () => {
  it("renders a dedicated thick cyan edge over a playable card", () => {
    const card = gameObjectFactory
      .withId(401)
      .inHand()
      .named("Playable Card")
      .build();
    const gameState = gameStateFactory
      .withPlayers({ id: 0, hand: [card.id] }, 1)
      .withObjects(card)
      .priority(0)
      .build();
    const castAction: GameAction = {
      type: "CastSpell",
      data: { object_id: card.id, card_id: card.card_id, targets: [] },
    };

    act(() => {
      useGameStore.setState({
        gameMode: "local",
        gameState,
        waitingFor: gameState.waiting_for,
        legalActionsByObject: { [String(card.id)]: [castAction] },
        spellCosts: {},
      });
    });

    const { container } = render(<PlayerHand />);
    const edge = container.querySelector("[data-playable-hand-card-edge]");

    expect(edge).not.toBeNull();
    expect(edge).toHaveClass("border-[3px]", "border-cyan-300/95");
  });

  it("does not apply the spell-cast edge to a playable land", () => {
    const land = gameObjectFactory
      .land()
      .withId(402)
      .inHand()
      .named("Playable Land")
      .build();
    const gameState = gameStateFactory
      .withPlayers({ id: 0, hand: [land.id] }, 1)
      .withObjects(land)
      .priority(0)
      .build();
    const playAction: GameAction = {
      type: "PlayLand",
      data: { object_id: land.id, card_id: land.card_id },
    };

    act(() => {
      useGameStore.setState({
        gameMode: "local",
        gameState,
        waitingFor: gameState.waiting_for,
        legalActionsByObject: { [String(land.id)]: [playAction] },
        spellCosts: {},
      });
    });

    const { container } = render(<PlayerHand />);

    expect(
      container.querySelector("[data-playable-hand-card-edge]"),
    ).toBeNull();
  });
});
