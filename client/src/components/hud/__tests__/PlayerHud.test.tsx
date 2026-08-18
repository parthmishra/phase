import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGameStore } from "../../../stores/gameStore.ts";
import { useMultiplayerStore } from "../../../stores/multiplayerStore.ts";
import { useUiStore } from "../../../stores/uiStore.ts";
import { buildGameState } from "../../../test/factories/gameStateFactory.ts";
import { PlayerHud, TOUCH_TABLET_PLAYER_HUD_QUERY } from "../PlayerHud.tsx";

describe("PlayerHud", () => {
  beforeEach(() => {
    useMultiplayerStore.setState({
      activePlayerId: 0,
      playerAvatars: new Map([[0, "/player-avatar.jpg"]]),
    });
    useUiStore.setState({ fullControl: false, manualManaOverride: false });
    useGameStore.setState({ gameState: buildGameState(), gameMode: null, stateHistory: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders local poison and speed as compact accessible badges", () => {
    const gameState = buildGameState();
    gameState.players[0].poison_counters = 8;
    gameState.players[0].speed = 3;

    act(() => {
      useGameStore.setState({ gameState });
    });

    render(<PlayerHud />);

    // Badges now use the custom GameplayTooltip (text rendered in the DOM)
    // rather than a native `title`; the aria-label stays on the badge element.
    expect(screen.getByLabelText("8 poison counters")).toBeInTheDocument();
    expect(screen.getByText("Poison counters: 8")).toBeInTheDocument();
    expect(screen.getByLabelText("Speed 3")).toBeInTheDocument();
    expect(screen.getByText("Speed: 3")).toBeInTheDocument();
    expect(screen.queryByText("Speed")).toBeNull();
  });

  it("hides local zero poison counters", () => {
    render(<PlayerHud />);

    expect(screen.queryByText(/Poison counters:/)).toBeNull();
  });

  it("renders local Next Up badge only for the next actual turn", () => {
    act(() => {
      useGameStore.setState({
        gameState: buildGameState({
          derived: {
            turn_order: [
              { player: 0, slot_index: 1, turns_from_now: 1, turn_number: 2 },
              { player: 0, slot_index: 2, turns_from_now: 2, turn_number: 3 },
            ],
          },
        }),
      });
    });

    render(<PlayerHud />);

    expect(screen.getByTitle("This player's turn is next.")).toHaveTextContent("Next Up");
  });

  it("uses a portrait-filled life pill with independent glass controls on mobile", () => {
    const originalWidth = window.innerWidth;
    act(() => {
      useGameStore.setState({ gameMode: "ai", stateHistory: [buildGameState()] });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      window.dispatchEvent(new Event("resize"));
    });

    const { container } = render(<PlayerHud />);

    expect(container.querySelector('[data-edge-pill-layout="true"]')).toHaveAttribute(
      "data-player-life-shape",
      "pill",
    );
    const plate = container.querySelector('[data-hud-plate]');
    const cornerControls = container.querySelector('[data-player-hud-corner-controls]');
    const undoControl = container.querySelector('[data-player-hud-undo-control]');
    expect(cornerControls).toContainElement(
      screen.getByRole("button", { name: "Full Control Off" }),
    );
    expect(cornerControls).toContainElement(
      screen.getByRole("button", { name: "Manual" }),
    );
    expect(plate).not.toContainElement(screen.getByRole("button", { name: "Manual" }));
    expect(plate).not.toContainElement(screen.getByRole("button", { name: "Full Control Off" }));
    expect(plate).not.toContainElement(screen.getByRole("button", { name: "Undo" }));
    expect(undoControl).toContainElement(
      screen.getByRole("button", { name: "Undo" }),
    );
    expect(plate).toHaveTextContent("20");
    expect(
      plate?.querySelector("[data-hud-plate-label-text]"),
    ).toHaveTextContent("You");
    expect(plate?.querySelector("svg")).toBeNull();
    expect(plate?.querySelector('[data-hud-plate-art] img')).toHaveAttribute(
      "src",
      "/player-avatar.jpg",
    );
    expect(container.querySelector('[data-major-phase-stop-rail]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-hud-plate-corner]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-hud-plate-trailing]')).not.toBeInTheDocument();
    const manualMana = screen.getByRole("button", { name: "Manual" });
    expect(manualMana).toHaveAttribute("data-icon-only", "true");
    expect(manualMana).toHaveClass("arena-liquid-glass-control");
    expect(manualMana.querySelector("[data-control-label]")).toBeNull();
    const fullControl = screen.getByRole("button", { name: "Full Control Off" });
    expect(fullControl).toHaveAttribute("data-icon-only", "true");
    expect(fullControl).toHaveClass("arena-liquid-glass-control");
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveClass("arena-liquid-glass-control");
    expect(undo.querySelector("svg")).toHaveClass("h-5", "w-5");
    expect(undoControl).toHaveClass("fixed");

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      window.dispatchEvent(new Event("resize"));
    });
  });

  it("uses the same edge pill on a coarse-pointer 13-inch iPad Pro", () => {
    const originalWidth = window.innerWidth;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === TOUCH_TABLET_PLAYER_HUD_QUERY,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    act(() => {
      useGameStore.setState({ gameMode: "ai", stateHistory: [buildGameState()] });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1376 });
      window.dispatchEvent(new Event("resize"));
    });

    const { container } = render(<PlayerHud />);

    expect(container.querySelector('[data-edge-pill-layout="true"]')).toBeInTheDocument();
    expect(container.querySelector('[data-edge-pill-layout="true"]')).toHaveAttribute(
      "data-player-life-shape",
      "pill",
    );
    expect(container.querySelector('[data-player-hud-corner-controls]')).toContainElement(
      screen.getByRole("button", { name: "Full Control Off" }),
    );
    expect(container.querySelector('[data-player-hud-corner-controls]')).toContainElement(
      screen.getByRole("button", { name: "Manual" }),
    );
    expect(container.querySelector('[data-player-hud-undo-control]')).toContainElement(
      screen.getByRole("button", { name: "Undo" }),
    );
    expect(container.querySelector('[data-major-phase-stop-rail]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-hud-plate-corner]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-hud-plate-trailing]')).not.toBeInTheDocument();

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      window.dispatchEvent(new Event("resize"));
    });
  });
});
