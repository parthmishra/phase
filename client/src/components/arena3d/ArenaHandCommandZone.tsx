import { useMemo } from "react";

import type { PlayerId } from "../../adapter/types.ts";
import { usePerspectivePlayerId } from "../../hooks/usePlayerId.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { useUiStore } from "../../stores/uiStore.ts";
import { commandZoneLeaders } from "../../viewmodel/commanderColumn.ts";
import {
  getOpponentIds,
  resolveFocusedOpponent,
} from "../../viewmodel/gameStateView.ts";
import { CommanderCardZone } from "../zone/CommanderCardZone.tsx";

interface ArenaHandCommandZoneProps {
  playerId: PlayerId;
  seat: "player" | "opponent";
}

/**
 * Keeps public command-zone cards beside the hand without joining the hand fan.
 * CommanderCardZone remains the interaction authority for cast, commander tax,
 * commander ninjutsu, inspection, and mana-payment preview.
 */
export function ArenaHandCommandZone({
  playerId,
  seat,
}: ArenaHandCommandZoneProps) {
  const gameState = useGameStore((state) => state.gameState);
  const leaders = useMemo(
    () => (gameState ? commandZoneLeaders(gameState, playerId) : []),
    [gameState, playerId],
  );

  if (leaders.length === 0) return null;

  const scale = seat === "player" ? 0.78 : 0.66;
  const cardStyle = {
    "--card-w": `calc(var(--card-base) * var(--card-size-scale) * ${scale})`,
    "--card-h": `calc(var(--card-base) * var(--card-size-scale) * ${scale} * 1.4)`,
  } as React.CSSProperties;

  return (
    <div
      className={`relative flex shrink-0 items-end overflow-visible ${
        seat === "player"
          ? "mr-4 border-r border-amber-200/22 pr-4"
          : "ml-4 border-l border-amber-200/18 pl-4"
      }`}
      style={cardStyle}
      data-arena-hand-command-zone={seat}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-[12%] w-px bg-gradient-to-b from-transparent via-amber-200/35 to-transparent"
        style={seat === "player" ? { right: "-1px" } : { left: "-1px" }}
      />
      <div className={seat === "opponent" ? "rotate-180" : undefined}>
        <CommanderCardZone
          playerId={playerId}
          splitOverview={seat === "opponent"}
          immersiveGlow={seat === "player"}
        />
      </div>
    </div>
  );
}

/** Command-card dock matching the same focused opponent as OpponentHand. */
export function ArenaFocusedOpponentCommandZone() {
  const gameState = useGameStore((state) => state.gameState);
  const perspectivePlayerId = usePerspectivePlayerId();
  const focusedOpponent = useUiStore((state) => state.focusedOpponent);
  const opponents = useMemo(
    () => getOpponentIds(gameState, perspectivePlayerId),
    [gameState, perspectivePlayerId],
  );
  const opponentId =
    resolveFocusedOpponent(focusedOpponent, opponents) ?? opponents[0] ?? null;

  if (opponentId == null) return null;

  return (
    <ArenaHandCommandZone
      playerId={opponentId}
      seat="opponent"
    />
  );
}
