import type { ObjectId, PlayerId } from "../../adapter/types.ts";
import type { GroupedPermanent } from "../../viewmodel/battlefieldProps.ts";
import type { PlayerBattlefieldView } from "../../viewmodel/gameStateView.ts";

export type ArenaSeat = "local" | "far" | "left" | "right";
export type ArenaTableLayout = "duel" | "pod";
export type ArenaLane = "creatures" | "support" | "lands";

export interface ArenaSeatAssignment {
  playerId: PlayerId;
  seat: Exclude<ArenaSeat, "local">;
}

export interface ArenaPlacement {
  objectId: ObjectId;
  pileCount: number;
  lane: ArenaLane;
  position: [number, number, number];
  faceAngle: number;
  attackVector: [number, number];
}

export interface ArenaZoneLayout {
  faceAngle: number;
  library: [number, number, number];
  graveyard: [number, number, number];
  exile: [number, number, number];
}

interface ArenaSeatFrame {
  faceAngle: number;
  attackVector: [number, number];
  centers: Record<ArenaLane, [number, number]>;
  widths: Record<ArenaLane, number>;
}

const SIDE_SEAT_ANGLE = Math.PI * 0.34;

const DUEL_WIDTHS: Record<ArenaLane, number> = {
  creatures: 9.4,
  support: 8.8,
  lands: 5.8,
};

const POD_LOCAL_WIDTHS: Record<ArenaLane, number> = {
  creatures: 7.2,
  support: 6.4,
  lands: 5.2,
};

const POD_FAR_WIDTHS: Record<ArenaLane, number> = {
  creatures: 5.2,
  support: 4.6,
  lands: 3.8,
};

const POD_SIDE_WIDTHS: Record<ArenaLane, number> = {
  creatures: 3.8,
  support: 3.4,
  lands: 3,
};

export function layoutArenaSeat(
  view: PlayerBattlefieldView,
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout = "duel",
): ArenaPlacement[] {
  const frame = arenaSeatFrame(seat, tableLayout);
  const support = [...view.support, ...view.planeswalkers, ...view.other];

  return [
    ...layoutLane(view.creatures, "creatures", frame),
    ...layoutLane(support, "support", frame),
    ...layoutLane(view.lands, "lands", frame),
  ];
}

export function assignArenaOpponentSeats(
  seatOrder: PlayerId[],
  perspectivePlayerId: PlayerId,
  liveOpponentIds: PlayerId[],
): ArenaSeatAssignment[] {
  const perspectiveIndex = seatOrder.indexOf(perspectivePlayerId);
  const stableOrder = perspectiveIndex < 0
    ? [perspectivePlayerId, ...liveOpponentIds]
    : [
        ...seatOrder.slice(perspectiveIndex),
        ...seatOrder.slice(0, perspectiveIndex),
      ];
  const relativeOpponents = stableOrder.filter(
    (playerId) => playerId !== perspectivePlayerId,
  );
  const liveOpponents = new Set(liveOpponentIds);
  const seats: Exclude<ArenaSeat, "local">[] =
    relativeOpponents.length <= 1
      ? ["far"]
      : relativeOpponents.length === 2
        ? ["left", "right"]
        : ["left", "far", "right"];

  return relativeOpponents.flatMap((playerId, index) => {
    const seat = seats[index];
    return seat && liveOpponents.has(playerId) ? [{ playerId, seat }] : [];
  });
}

export function arenaZoneLayout(
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout = "duel",
): ArenaZoneLayout {
  if (seat === "local") {
    return {
      faceAngle: 0,
      library: [-5.55, 0.08, 3.46],
      graveyard: [-4.1, 0.08, 3.46],
      exile: [-2.65, 0.08, 3.46],
    };
  }
  if (seat === "far") {
    return tableLayout === "pod"
      ? {
          faceAngle: Math.PI,
          library: [4.45, 0.08, -3.5],
          graveyard: [3, 0.08, -3.5],
          exile: [1.55, 0.08, -3.5],
        }
      : {
          faceAngle: Math.PI,
          library: [5.55, 0.08, -3.46],
          graveyard: [4.1, 0.08, -3.46],
          exile: [2.65, 0.08, -3.46],
        };
  }
  if (seat === "left") {
    return {
      faceAngle: -SIDE_SEAT_ANGLE,
      library: [-6.45, 0.08, -2.7],
      graveyard: [-6.45, 0.08, -1.25],
      exile: [-6.45, 0.08, 0.2],
    };
  }
  return {
    faceAngle: SIDE_SEAT_ANGLE,
    library: [6.45, 0.08, -2.7],
    graveyard: [6.45, 0.08, -1.25],
    exile: [6.45, 0.08, 0.2],
  };
}

function layoutLane(
  groups: GroupedPermanent[],
  lane: ArenaLane,
  frame: ArenaSeatFrame,
): ArenaPlacement[] {
  const offsets = spreadPositions(groups.length, frame.widths[lane]);
  const [centerX, centerZ] = frame.centers[lane];
  const tangentX = Math.cos(frame.faceAngle);
  const tangentZ = -Math.sin(frame.faceAngle);
  return groups.map((group, index) => ({
    objectId: group.ids[0],
    pileCount: group.count,
    lane,
    position: [
      centerX + tangentX * offsets[index],
      0.07,
      centerZ + tangentZ * offsets[index],
    ],
    faceAngle: frame.faceAngle,
    attackVector: frame.attackVector,
  }));
}

function arenaSeatFrame(
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout,
): ArenaSeatFrame {
  if (seat === "local") {
    return {
      faceAngle: 0,
      attackVector: [0, -1],
      centers: {
        creatures: [0, 0.35],
        support: [0, 1.15],
        lands: [0, 2],
      },
      widths: tableLayout === "pod" ? POD_LOCAL_WIDTHS : DUEL_WIDTHS,
    };
  }
  if (seat === "far") {
    return {
      faceAngle: Math.PI,
      attackVector: [0, 1],
      centers: {
        creatures: [0, -0.35],
        support: [0, -1.15],
        lands: [0, -2],
      },
      widths: tableLayout === "pod" ? POD_FAR_WIDTHS : DUEL_WIDTHS,
    };
  }
  if (seat === "left") {
    return {
      faceAngle: -SIDE_SEAT_ANGLE,
      attackVector: [0.84, 0.54],
      centers: {
        creatures: [-2.85, -0.1],
        support: [-3.55, -0.7],
        lands: [-4.25, -1.3],
      },
      widths: POD_SIDE_WIDTHS,
    };
  }
  return {
    faceAngle: SIDE_SEAT_ANGLE,
    attackVector: [-0.84, 0.54],
    centers: {
      creatures: [2.85, -0.1],
      support: [3.55, -0.7],
      lands: [4.25, -1.3],
    },
    widths: POD_SIDE_WIDTHS,
  };
}

export function spreadPositions(count: number, availableWidth: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const gap = Math.min(2.02, availableWidth / (count - 1));
  const start = -((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => start + index * gap);
}
