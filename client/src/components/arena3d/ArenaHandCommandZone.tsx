import { useMemo } from "react";

import type { PlayerId } from "../../adapter/types.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { commandZoneLeaders } from "../../viewmodel/commanderColumn.ts";
import { CommanderCardZone } from "../zone/CommanderCardZone.tsx";

interface ArenaHandCommandZoneProps {
  playerId: PlayerId;
  seat: "player";
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

  return (
    <div
      className="pointer-events-none relative mr-2 flex shrink-0 items-end overflow-visible"
      data-arena-hand-command-zone={seat}
    >
      <CommanderCardZone playerId={playerId} handPresentation />
    </div>
  );
}
