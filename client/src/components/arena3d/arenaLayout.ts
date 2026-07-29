import type { ObjectId, PlayerId } from "../../adapter/types.ts";
import type { GroupedPermanent } from "../../viewmodel/battlefieldProps.ts";
import type { PlayerBattlefieldView } from "../../viewmodel/gameStateView.ts";

export type ArenaSeat = "local" | "far" | "left" | "right";
export type ArenaTableLayout = "duel" | "pod";
export type ArenaPodPresentation = "inward" | "kitchen";
export type ArenaLane = "creatures" | "support" | "lands";

export const ARENA_CARD_WIDTH = 1.3;
export const ARENA_CARD_DEPTH = 1.82;

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
  cardScale: number;
}

export interface ArenaZoneLayout {
  faceAngle: number;
  library: [number, number, number];
  graveyard: [number, number, number];
  exile: [number, number, number];
}

export interface ArenaLaneZoneLayout {
  lane: ArenaLane;
  position: [number, number, number];
  faceAngle: number;
  width: number;
  depth: number;
}

interface ArenaSeatFrame {
  faceAngle: number;
  attackVector: [number, number];
  centers: Record<ArenaLane, [number, number]>;
  widths: Record<ArenaLane, number>;
  alignments: Record<ArenaLane, LaneAlignment>;
}

type LaneAlignment = -1 | 0 | 1;

const INWARD_SIDE_SEAT_ANGLE = Math.PI * 0.555;
const KITCHEN_SIDE_SEAT_ANGLE = Math.PI / 2;
const LANE_DEPTH = 1.98;
const LANE_EDGE_PADDING = 0.08;
const CARD_GAP = 0.12;
const SIDE_ROW_SPLIT = 2.2;
const CARD_ROTATION_FOOTPRINT = Math.max(
  ARENA_CARD_WIDTH,
  ARENA_CARD_DEPTH,
);
const ZONE_PILE_GAP = 1.45;

const DUEL_WIDTHS: Record<ArenaLane, number> = {
  creatures: 9.4,
  support: 4,
  lands: 4,
};

const POD_LOCAL_WIDTHS: Record<ArenaLane, number> = {
  creatures: 6,
  support: 3.2,
  lands: 3.2,
};

const POD_FAR_WIDTHS: Record<ArenaLane, number> = {
  creatures: 5.2,
  support: 3,
  lands: 3,
};

const POD_SIDE_WIDTHS: Record<ArenaLane, number> = {
  creatures: 4.2,
  support: 4,
  lands: 4,
};

const CENTERED_LANE_ALIGNMENTS: Record<ArenaLane, LaneAlignment> = {
  creatures: 0,
  support: 0,
  lands: 0,
};

export function layoutArenaSeat(
  view: PlayerBattlefieldView,
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout = "duel",
  podPresentation: ArenaPodPresentation = "inward",
): ArenaPlacement[] {
  const frame = arenaSeatFrame(seat, tableLayout, podPresentation);
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
  podPresentation: ArenaPodPresentation = "inward",
): ArenaZoneLayout {
  if (seat === "local") {
    return tableLayout === "pod"
      ? arenaZoneRow(0, [-5.7, 0.08, 4.35])
      : {
          faceAngle: 0,
          library: [-5.55, 0.08, 3.46],
          graveyard: [-4.1, 0.08, 3.46],
          exile: [-2.65, 0.08, 3.46],
        };
  }
  if (seat === "far") {
    return tableLayout === "pod"
      ? arenaZoneRow(
          Math.PI,
          podPresentation === "kitchen"
            ? [5.7, 0.08, -5.35]
            : [5.4, 0.08, -5.35],
        )
      : {
          faceAngle: Math.PI,
          library: [5.55, 0.08, -3.46],
          graveyard: [4.1, 0.08, -3.46],
          exile: [2.65, 0.08, -3.46],
        };
  }
  if (seat === "left") {
    const faceAngle =
      podPresentation === "kitchen"
        ? -KITCHEN_SIDE_SEAT_ANGLE
        : -INWARD_SIDE_SEAT_ANGLE;
    return arenaZoneRow(
      faceAngle,
      podPresentation === "kitchen"
        ? [-7.6, 0.08, -4.3]
        : [-6.3, 0.08, -3.3],
    );
  }
  const faceAngle =
    podPresentation === "kitchen"
      ? KITCHEN_SIDE_SEAT_ANGLE
      : INWARD_SIDE_SEAT_ANGLE;
  return arenaZoneRow(
    faceAngle,
    podPresentation === "kitchen"
      ? [7.6, 0.08, 3]
      : [6.3, 0.08, 2.55],
  );
}

function arenaZoneRow(
  faceAngle: number,
  library: [number, number, number],
): ArenaZoneLayout {
  const rightX = Math.cos(faceAngle);
  const rightZ = -Math.sin(faceAngle);
  const offset = (distance: number): [number, number, number] => [
    library[0] + rightX * distance,
    library[1],
    library[2] + rightZ * distance,
  ];
  return {
    faceAngle,
    library,
    graveyard: offset(ZONE_PILE_GAP),
    exile: offset(ZONE_PILE_GAP * 2),
  };
}

export function arenaLaneZoneLayouts(
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout = "duel",
  podPresentation: ArenaPodPresentation = "inward",
): ArenaLaneZoneLayout[] {
  const frame = arenaSeatFrame(seat, tableLayout, podPresentation);
  const lanes: ArenaLane[] = ["creatures", "support", "lands"];
  return lanes.map((lane) => ({
    lane,
    position: [
      frame.centers[lane][0],
      0.018,
      frame.centers[lane][1],
    ],
    faceAngle: frame.faceAngle,
    width: frame.widths[lane],
    depth: LANE_DEPTH,
  }));
}

function layoutLane(
  groups: GroupedPermanent[],
  lane: ArenaLane,
  frame: ArenaSeatFrame,
): ArenaPlacement[] {
  const fit = fitArenaLaneCards(groups.length, frame.widths[lane]);
  const offsets = alignArenaLaneCards(
    fit,
    frame.widths[lane],
    frame.alignments[lane],
  );
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
    cardScale: fit.cardScale,
  }));
}

function alignArenaLaneCards(
  fit: ReturnType<typeof fitArenaLaneCards>,
  laneWidth: number,
  alignment: LaneAlignment,
): number[] {
  if (alignment === 0 || fit.offsets.length === 0) return fit.offsets;

  const innerWidth = Math.max(laneWidth - LANE_EDGE_PADDING * 2, 0);
  const occupiedWidth =
    CARD_ROTATION_FOOTPRINT * fit.cardScale * fit.offsets.length
    + fit.gap * Math.max(fit.offsets.length - 1, 0);
  const shift = alignment * Math.max((innerWidth - occupiedWidth) / 2, 0);
  return fit.offsets.map((offset) => offset + shift);
}

export function fitArenaLaneCards(
  count: number,
  laneWidth: number,
): { offsets: number[]; cardScale: number; gap: number } {
  if (count <= 0) {
    return { offsets: [], cardScale: 1, gap: 0 };
  }

  const innerWidth = Math.max(laneWidth - LANE_EDGE_PADDING * 2, 0);
  const depthScale = Math.max(
    (LANE_DEPTH - LANE_EDGE_PADDING * 2) / ARENA_CARD_DEPTH,
    0,
  );
  const gap =
    count === 1
      ? 0
      : Math.min(CARD_GAP, innerWidth / (count * 4));
  // Reserve the larger card dimension along the lane so tapping a permanent
  // cannot rotate it into its neighbors.
  const widthScale = Math.max(
    (innerWidth - gap * (count - 1))
      / (count * CARD_ROTATION_FOOTPRINT),
    0,
  );
  const cardScale = Math.min(1, depthScale, widthScale);
  const stride = CARD_ROTATION_FOOTPRINT * cardScale + gap;
  const start = -((count - 1) * stride) / 2;
  return {
    offsets: Array.from(
      { length: count },
      (_, index) => start + index * stride,
    ),
    cardScale,
    gap,
  };
}

function arenaSeatFrame(
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout,
  podPresentation: ArenaPodPresentation,
): ArenaSeatFrame {
  if (tableLayout === "pod") {
    return podSeatFrame(seat, podPresentation);
  }
  if (seat === "local") {
    return {
      faceAngle: 0,
      attackVector: [0, -1],
      centers: {
        creatures: [0, 0.2],
        support: [-2.4, 2.5],
        lands: [2.4, 2.5],
      },
      widths: DUEL_WIDTHS,
      alignments: CENTERED_LANE_ALIGNMENTS,
    };
  }
  if (seat === "far") {
    const centers: Record<ArenaLane, [number, number]> = {
      creatures: [0, -1.9],
      support: [2.4, -4.2],
      lands: [-2.4, -4.2],
    };
    return {
      faceAngle: Math.PI,
      attackVector: [0, 1],
      centers,
      widths: DUEL_WIDTHS,
      alignments: opponentLaneAlignments(centers, Math.PI),
    };
  }
  return podSeatFrame(seat, podPresentation);
}

function podSeatFrame(
  seat: ArenaSeat,
  podPresentation: ArenaPodPresentation,
): ArenaSeatFrame {
  if (seat === "local") {
    return {
      faceAngle: 0,
      attackVector: [0, -1],
      centers: {
        creatures: [0, 0],
        support: [-1.8, 2.35],
        lands: [1.8, 2.35],
      },
      widths: POD_LOCAL_WIDTHS,
      alignments: CENTERED_LANE_ALIGNMENTS,
    };
  }
  if (seat === "far") {
    const widths =
      podPresentation === "kitchen" ? POD_LOCAL_WIDTHS : POD_FAR_WIDTHS;
    const centers: Record<ArenaLane, [number, number]> = {
      creatures: [0, -2.3],
      support: [-2.6, -4.75],
      lands: [0.8, -4.75],
    };
    return {
      faceAngle: Math.PI,
      attackVector: [0, 1],
      centers,
      widths,
      alignments: opponentLaneAlignments(centers, Math.PI),
    };
  }
  const sideAngle =
    podPresentation === "kitchen"
      ? KITCHEN_SIDE_SEAT_ANGLE
      : INWARD_SIDE_SEAT_ANGLE;
  return sideSeatFrame(seat, sideAngle, podPresentation);
}

function sideSeatFrame(
  seat: Extract<ArenaSeat, "left" | "right">,
  sideAngle: number,
  podPresentation: ArenaPodPresentation,
): ArenaSeatFrame {
  const side = seat === "left" ? -1 : 1;
  const faceAngle = side * sideAngle;
  const backRowX = side * (podPresentation === "kitchen" ? 5.45 : 5.35);
  const centers: Record<ArenaLane, [number, number]> = {
    creatures: [side * 3.95, 0],
    support: [backRowX, -side * SIDE_ROW_SPLIT],
    lands: [backRowX, side * SIDE_ROW_SPLIT],
  };
  return {
    faceAngle,
    attackVector: [-Math.sin(faceAngle), -Math.cos(faceAngle)],
    centers,
    widths: POD_SIDE_WIDTHS,
    alignments: opponentLaneAlignments(centers, faceAngle),
  };
}

function opponentLaneAlignments(
  centers: Record<ArenaLane, [number, number]>,
  faceAngle: number,
): Record<ArenaLane, LaneAlignment> {
  return {
    creatures: 0,
    support: innerEdgeAlignment(centers.support, faceAngle),
    lands: innerEdgeAlignment(centers.lands, faceAngle),
  };
}

function innerEdgeAlignment(
  center: [number, number],
  faceAngle: number,
): LaneAlignment {
  const tangentX = Math.cos(faceAngle);
  const tangentZ = -Math.sin(faceAngle);
  const towardOrigin = -center[0] * tangentX - center[1] * tangentZ;
  return towardOrigin < 0 ? -1 : towardOrigin > 0 ? 1 : 0;
}

export function spreadPositions(count: number, availableWidth: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const gap = Math.min(2.02, availableWidth / (count - 1));
  const start = -((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => start + index * gap);
}
