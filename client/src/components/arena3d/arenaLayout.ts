import type { ObjectId, PlayerId } from "../../adapter/types.ts";
import type { GroupedPermanent } from "../../viewmodel/battlefieldProps.ts";
import type { PlayerBattlefieldView } from "../../viewmodel/gameStateView.ts";

export type ArenaSeat = "local" | "far" | "left" | "right";
export type ArenaTableLayout = "duel" | "pod";
export type ArenaViewportLayout = "wide" | "compact";
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

export interface ArenaHeldHandLayout {
  position: [number, number, number];
  faceAngle: number;
  scale: number;
}

export interface ArenaHeldCardTransform {
  x: number;
  y: number;
  z: number;
  rotationZ: number;
  scale: number;
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
}

const CARDINAL_SIDE_SEAT_ANGLE = Math.PI / 2;
const LANE_DEPTH = 1.98;
const LANE_EDGE_PADDING = 0.08;
const CARD_GAP = 0.12;
const SIDE_ROW_SPLIT = 1.7;
const SIDE_CREATURE_CENTER_X = 3.5;
const SIDE_BACK_ROW_X = 5.62;
const SIDE_PILE_ROW_X = 7.65;
const LOCAL_BACK_ROW_Z = 1.8;
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
  creatures: 4.6,
  support: 2.3,
  lands: 2.3,
};

const POD_SIDE_WIDTHS: Record<ArenaLane, number> = {
  creatures: 4.2,
  support: 3,
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
  viewportLayout: ArenaViewportLayout = "wide",
): ArenaZoneLayout {
  if (seat === "local") {
    if (tableLayout === "duel" && viewportLayout === "compact") {
      return arenaZoneRow(0, [-1.45, 0.08, 4.35]);
    }
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
    if (tableLayout === "duel" && viewportLayout === "compact") {
      return arenaZoneRow(Math.PI, [1.45, 0.08, -3.9]);
    }
    return tableLayout === "pod"
      ? arenaZoneRow(
          Math.PI,
          [6.2, 0.08, -5.35],
        )
      : {
          faceAngle: Math.PI,
          library: [5.55, 0.08, -3.46],
          graveyard: [4.1, 0.08, -3.46],
          exile: [2.65, 0.08, -3.46],
        };
  }
  if (seat === "left") {
    const faceAngle = -CARDINAL_SIDE_SEAT_ANGLE;
    return arenaZoneRow(faceAngle, [-SIDE_PILE_ROW_X, 0.08, -4.3]);
  }
  const faceAngle = CARDINAL_SIDE_SEAT_ANGLE;
  return arenaZoneRow(faceAngle, [SIDE_PILE_ROW_X, 0.08, 3]);
}

/**
 * Anchors concealed hands above the plane at each seat's outer edge. Fans are
 * intentionally large enough to read against their own libraries, then
 * partially cropped by the viewport like the opponent hand in Magic Arena.
 */
export function arenaHeldHandLayout(
  seat: ArenaSeat,
  tableLayout: ArenaTableLayout = "duel",
): ArenaHeldHandLayout {
  if (seat === "local") {
    return {
      position: [0, 0.1, tableLayout === "pod" ? 6.1 : 5.25],
      faceAngle: Math.PI,
      scale: tableLayout === "pod" ? 0.84 : 0.92,
    };
  }
  if (seat === "far") {
    return {
      position: [0, 0.92, tableLayout === "pod" ? -5.95 : -5.25],
      faceAngle: 0,
      scale: tableLayout === "pod" ? 0.74 : 0.82,
    };
  }
  if (seat === "left") {
    return {
      position: [-8.35, 0.94, -0.55],
      faceAngle: Math.PI / 2,
      scale: 0.84,
    };
  }
  return {
    position: [8.35, 0.94, 0.55],
    faceAngle: -Math.PI / 2,
    scale: 0.84,
  };
}

/** Broad, bottom-pivoted fan geometry that keeps even large hands legible. */
export function arenaHeldCardFan(count: number): ArenaHeldCardTransform[] {
  if (count <= 0) return [];
  const center = (count - 1) / 2;
  const step = count === 1 ? 0 : Math.min(0.38, 3.6 / (count - 1));
  const scale = count > 16 ? 0.68 : count > 11 ? 0.78 : 0.88;

  return Array.from({ length: count }, (_, index) => {
    const centeredIndex = index - center;
    const normalized = center === 0 ? 0 : centeredIndex / center;
    return {
      x: centeredIndex * step,
      y: (1 - Math.abs(normalized)) * 0.13,
      z: index * 0.012,
      rotationZ: -normalized * 0.24,
      scale,
    };
  });
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
): ArenaLaneZoneLayout[] {
  const frame = arenaSeatFrame(seat, tableLayout);
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
  const [centerX, centerZ] = frame.centers[lane];
  const tangentX = Math.cos(frame.faceAngle);
  const tangentZ = -Math.sin(frame.faceAngle);
  return groups.map((group, index) => ({
    objectId: group.ids[0],
    pileCount: group.count,
    lane,
    position: [
      centerX + tangentX * fit.offsets[index],
      // Cards hover above the stone rather than lying on it: enough clearance
      // for the sun to drop a readable shadow beside each permanent.
      0.16,
      centerZ + tangentZ * fit.offsets[index],
    ],
    faceAngle: frame.faceAngle,
    attackVector: frame.attackVector,
    cardScale: fit.cardScale,
  }));
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
): ArenaSeatFrame {
  if (tableLayout === "pod") {
    return podSeatFrame(seat);
  }
  if (seat === "local") {
    return {
      faceAngle: 0,
      attackVector: [0, -1],
      centers: {
        creatures: [0, 0.2],
        support: [-2.4, LOCAL_BACK_ROW_Z],
        lands: [2.4, LOCAL_BACK_ROW_Z],
      },
      widths: DUEL_WIDTHS,
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
    };
  }
  return podSeatFrame(seat);
}

function podSeatFrame(seat: ArenaSeat): ArenaSeatFrame {
  if (seat === "local") {
    return {
      faceAngle: 0,
      attackVector: [0, -1],
      centers: {
        creatures: [0, -0.3],
        support: [-1.22, LOCAL_BACK_ROW_Z],
        lands: [1.22, LOCAL_BACK_ROW_Z],
      },
      widths: POD_LOCAL_WIDTHS,
    };
  }
  if (seat === "far") {
    const centers: Record<ArenaLane, [number, number]> = {
      creatures: [0, -2.42],
      support: [-1.22, -4.55],
      lands: [1.22, -4.55],
    };
    return {
      faceAngle: Math.PI,
      attackVector: [0, 1],
      centers,
      widths: POD_LOCAL_WIDTHS,
    };
  }
  return sideSeatFrame(seat, CARDINAL_SIDE_SEAT_ANGLE);
}

function sideSeatFrame(
  seat: Extract<ArenaSeat, "left" | "right">,
  sideAngle: number,
): ArenaSeatFrame {
  const side = seat === "left" ? -1 : 1;
  const faceAngle = side * sideAngle;
  const backRowX = side * SIDE_BACK_ROW_X;
  const centers: Record<ArenaLane, [number, number]> = {
    creatures: [side * SIDE_CREATURE_CENTER_X, 0],
    support: [backRowX, -side * SIDE_ROW_SPLIT],
    lands: [backRowX, side * SIDE_ROW_SPLIT],
  };
  return {
    faceAngle,
    attackVector: [-Math.sin(faceAngle), -Math.cos(faceAngle)],
    centers,
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
