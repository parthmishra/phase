import type { ObjectId, PlayerId } from "../../adapter/types.ts";
import type { GroupedPermanent } from "../../viewmodel/battlefieldProps.ts";
import type { PlayerBattlefieldView } from "../../viewmodel/gameStateView.ts";

export type ArenaSeat = "local" | "far" | "left" | "right";
export type ArenaTableLayout = "duel" | "pod";
export type ArenaPodPresentation = "inward" | "kitchen";
export type ArenaLane = "creatures" | "support" | "lands";

export const ARENA_PERMANENT_WIDTH = 1.78;
export const ARENA_PERMANENT_DEPTH = 1.16;

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

const INWARD_SIDE_SEAT_ANGLE = Math.PI * 0.555;
const KITCHEN_SIDE_SEAT_ANGLE = Math.PI / 2;
const LANE_DEPTH = 1.24;
const LANE_SPACING = 1.15;
const ZONE_PILE_GAP = 1.45;

const DUEL_WIDTHS: Record<ArenaLane, number> = {
  creatures: 9.4,
  support: 8.8,
  lands: 5.8,
};

const POD_LOCAL_WIDTHS: Record<ArenaLane, number> = {
  creatures: 7.1,
  support: 6.8,
  lands: 6.4,
};

const POD_FAR_WIDTHS: Record<ArenaLane, number> = {
  creatures: 5.2,
  support: 4.6,
  lands: 3.8,
};

const POD_SIDE_WIDTHS: Record<ArenaLane, number> = {
  creatures: 3.2,
  support: 3.2,
  lands: 3.2,
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
            ? [5.7, 0.08, -4.75]
            : [3.5, 0.08, -5.05],
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
    return arenaZoneRow(faceAngle, [-6.3, 0.08, -3.3]);
  }
  const faceAngle =
    podPresentation === "kitchen"
      ? KITCHEN_SIDE_SEAT_ANGLE
      : INWARD_SIDE_SEAT_ANGLE;
  return {
    faceAngle,
    library: [4.85, 0.08, -2.8],
    graveyard: [6.3, 0.08, -2.8],
    exile: [3.4, 0.08, -2.8],
  };
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
  const usableCenterWidth = Math.max(
    frame.widths[lane] - ARENA_PERMANENT_WIDTH,
    0,
  );
  const offsets = spreadPositions(groups.length, usableCenterWidth);
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
        creatures: [0, 0.35],
        support: [0, 1.15],
        lands: [0, 2],
      },
      widths: DUEL_WIDTHS,
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
      widths: DUEL_WIDTHS,
    };
  }
  return podSeatFrame(seat, podPresentation);
}

function podSeatFrame(
  seat: ArenaSeat,
  podPresentation: ArenaPodPresentation,
): ArenaSeatFrame {
  if (seat === "local") {
    return seatFrameFromCenter(0, [0, 1.15], POD_LOCAL_WIDTHS);
  }
  if (seat === "far") {
    const widths =
      podPresentation === "kitchen" ? POD_LOCAL_WIDTHS : POD_FAR_WIDTHS;
    return seatFrameFromCenter(Math.PI, [0, -2.4], widths);
  }
  const sideAngle =
    podPresentation === "kitchen"
      ? KITCHEN_SIDE_SEAT_ANGLE
      : INWARD_SIDE_SEAT_ANGLE;
  if (seat === "left") {
    return seatFrameFromCenter(-sideAngle, [-5.7, -0.35], POD_SIDE_WIDTHS);
  }
  return seatFrameFromCenter(sideAngle, [5.7, -0.35], POD_SIDE_WIDTHS);
}

function seatFrameFromCenter(
  faceAngle: number,
  center: [number, number],
  widths: Record<ArenaLane, number>,
): ArenaSeatFrame {
  const towardCenterX = -Math.sin(faceAngle);
  const towardCenterZ = -Math.cos(faceAngle);
  const laneCenter = (offset: number): [number, number] => [
    center[0] + towardCenterX * offset,
    center[1] + towardCenterZ * offset,
  ];
  return {
    faceAngle,
    attackVector: [towardCenterX, towardCenterZ],
    centers: {
      creatures: laneCenter(LANE_SPACING),
      support: laneCenter(0),
      lands: laneCenter(-LANE_SPACING),
    },
    widths,
  };
}

export function spreadPositions(count: number, availableWidth: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const gap = Math.min(2.02, availableWidth / (count - 1));
  const start = -((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => start + index * gap);
}
