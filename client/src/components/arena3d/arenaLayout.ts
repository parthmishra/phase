import type { ObjectId } from "../../adapter/types.ts";
import type { GroupedPermanent } from "../../viewmodel/battlefieldProps.ts";
import type { PlayerBattlefieldView } from "../../viewmodel/gameStateView.ts";

export type ArenaSeat = "local" | "opponent";
export type ArenaLane = "creatures" | "support" | "lands";

export interface ArenaPlacement {
  objectId: ObjectId;
  pileCount: number;
  lane: ArenaLane;
  position: [number, number, number];
  faceAngle: number;
  attackDirection: -1 | 1;
}

export interface ArenaZoneLayout {
  faceAngle: number;
  library: [number, number, number];
  graveyard: [number, number, number];
  exile: [number, number, number];
}

const LANE_Z: Record<ArenaLane, number> = {
  creatures: 1.2,
  support: 2.55,
  lands: 3.9,
};

const LANE_WIDTH: Record<ArenaLane, number> = {
  creatures: 9.4,
  support: 8.8,
  lands: 9.4,
};

export function layoutArenaSeat(
  view: PlayerBattlefieldView,
  seat: ArenaSeat,
): ArenaPlacement[] {
  const direction = seat === "local" ? 1 : -1;
  const faceAngle = seat === "local" ? 0 : Math.PI;
  const attackDirection = seat === "local" ? -1 : 1;
  const support = [...view.support, ...view.planeswalkers, ...view.other];

  return [
    ...layoutLane(view.creatures, "creatures", direction, faceAngle, attackDirection),
    ...layoutLane(support, "support", direction, faceAngle, attackDirection),
    ...layoutLane(view.lands, "lands", direction, faceAngle, attackDirection),
  ];
}

export function arenaZoneLayout(seat: ArenaSeat): ArenaZoneLayout {
  if (seat === "local") {
    return {
      faceAngle: 0,
      library: [-6.3, 0.08, 3.82],
      graveyard: [-6.3, 0.08, 1.62],
      exile: [-6.3, 0.08, -0.58],
    };
  }
  return {
    faceAngle: Math.PI,
    library: [6.3, 0.08, -3.82],
    graveyard: [6.3, 0.08, -1.62],
    exile: [6.3, 0.08, 0.58],
  };
}

function layoutLane(
  groups: GroupedPermanent[],
  lane: ArenaLane,
  direction: number,
  faceAngle: number,
  attackDirection: -1 | 1,
): ArenaPlacement[] {
  const xPositions = spreadPositions(groups.length, LANE_WIDTH[lane]);
  return groups.map((group, index) => ({
    objectId: group.ids[0],
    pileCount: group.count,
    lane,
    position: [xPositions[index], 0.07, LANE_Z[lane] * direction],
    faceAngle,
    attackDirection,
  }));
}

export function spreadPositions(count: number, availableWidth: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const gap = Math.min(2.02, availableWidth / (count - 1));
  const start = -((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => start + index * gap);
}
