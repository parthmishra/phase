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

describe("PlayerHand castable glow", () => {
  it("renders a cyan shimmer outside a castable card without recoloring its frame", () => {
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
    const glow = container.querySelector("[data-castable-card-glow]");

    expect(glow).not.toBeNull();
    expect(glow).toHaveClass("-inset-[2px]", "rounded-[4.8%/3.4%]");
    expect(glow?.className).not.toContain("border");
    expect(glow?.className).not.toContain("ring-");
    expect(glow).toHaveStyle({ opacity: "0.76" });
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
      container.querySelector("[data-castable-card-glow]"),
    ).toBeNull();
  });
});
