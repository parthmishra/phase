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
import { OPPONENT_CARD_SCALE } from "../hand/handFanPresentation.ts";
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

  const cardStyle = seat === "opponent"
    ? {
        "--hand-card-w": `calc(var(--card-w) * ${OPPONENT_CARD_SCALE})`,
        "--hand-card-h": `calc(var(--hand-card-w) * 1.4)`,
      } as React.CSSProperties
    : undefined;

  return (
    <div
      className={`relative flex shrink-0 items-end overflow-visible ${
        seat === "player" ? "mr-2" : "ml-2"
      }`}
      style={cardStyle}
      data-arena-hand-command-zone={seat}
    >
      <div className={seat === "opponent" ? "rotate-180" : undefined}>
        <CommanderCardZone
          playerId={playerId}
          splitOverview={seat === "opponent"}
          handPresentation
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
