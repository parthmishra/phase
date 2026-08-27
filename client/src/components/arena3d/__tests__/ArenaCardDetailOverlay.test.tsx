import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useGameStore } from "../../../stores/gameStore.ts";
import { gameObjectFactory } from "../../../test/factories/gameObjectFactory.ts";
import { gameStateFactory } from "../../../test/factories/gameStateFactory.ts";
import { ArenaCardDetailOverlay } from "../ArenaCardDetailOverlay.tsx";

vi.mock("../../../hooks/useEngineCardData.ts", () => ({
  useCardParseDetails: () => [
    {
      category: "static",
      label: "Static parse node",
      source_text: "Static source text",
      supported: true,
    },
  ],
  useCardRulings: () => [],
  useEngineCardData: () => null,
}));

vi.mock("../../card/CardImage.tsx", () => ({
  CardImage: ({ cardName }: { cardName: string }) => (
    <img alt={`original-${cardName}`} />
  ),
}));

vi.mock("../ArenaCardFace.tsx", () => ({
  ArenaCardFace: ({
    objectId,
    className,
  }: {
    objectId: number;
    className?: string;
  }) => (
    <article aria-label={`card-${objectId}`} className={className} />
  ),
}));

afterEach(() => {
  cleanup();
  useGameStore.setState({ gameState: null });
});

describe("ArenaCardDetailOverlay", () => {
  it("shows the live card and Arena-style keyword explanations", () => {
    const card = gameObjectFactory
      .withId(17)
      .creature(2, 1)
      .named("Lightstall Inquisitor")
      .withKeywords("Vigilance")
      .build();
    useGameStore.setState({
      gameState: gameStateFactory.withPlayers(0, 1).withObjects(card).build(),
    });

    render(<ArenaCardDetailOverlay objectId={card.id} onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", {
        name: "Card details: Lightstall Inquisitor",
      }),
    ).toBeInTheDocument();
    const liveCard = screen.getByRole("article", { name: "card-17" });
    const liveFrame = liveCard.closest("[data-arena-live-card-detail-frame]");
    expect(liveFrame).toHaveStyle({
      width: "min(72vw, calc((100dvh - 6rem) * 5 / 7), 430px)",
      height: "min(100.8vw, calc(100dvh - 6rem), 602px)",
    });
    expect(liveCard).toHaveClass("!h-full", "!w-full");
    expect(screen.getByText("Vigilance")).toBeInTheDocument();
    expect(
      screen.getByText("Attacking doesn't cause this creature to tap."),
    ).toBeInTheDocument();
  });

  it("switches between the live face, original printing, and parse details", () => {
    const card = gameObjectFactory
      .withId(19)
      .creature()
      .named("Debuggable Card")
      .withKeywords("Flying")
      .build();
    useGameStore.setState({
      gameState: gameStateFactory.withPlayers(0, 1).withObjects(card).build(),
    });

    render(<ArenaCardDetailOverlay objectId={card.id} onClose={vi.fn()} />);

    expect(screen.getByRole("article", { name: "card-19" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(
      screen.getByRole("img", { name: "original-Debuggable Card" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "card-19" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Parse" }));
    expect(screen.getByText("Engine Parse")).toBeInTheDocument();
    expect(screen.getByText("Static parse node")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "original-Debuggable Card" }),
    ).not.toBeInTheDocument();
  });

  it("closes from the accessible button, backdrop, and Escape key", () => {
    const card = gameObjectFactory.withId(23).named("Foundry Relic").build();
    useGameStore.setState({
      gameState: gameStateFactory.withPlayers(0, 1).withObjects(card).build(),
    });
    const onClose = vi.fn();

    render(<ArenaCardDetailOverlay objectId={card.id} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close card details" }));
    fireEvent.pointerDown(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not expose a face-down card's identity or keywords", () => {
    const card = gameObjectFactory
      .withId(31)
      .creature()
      .named("Secret Creature")
      .withKeywords("Flying")
      .faceDown()
      .build();
    useGameStore.setState({
      gameState: gameStateFactory.withPlayers(0, 1).withObjects(card).build(),
    });

    render(<ArenaCardDetailOverlay objectId={card.id} onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: "Card details: Face-down card" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Secret Creature")).not.toBeInTheDocument();
    expect(screen.queryByText("Flying")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parse" })).not.toBeInTheDocument();
  });
});
