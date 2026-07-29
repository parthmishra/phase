import { describe, expect, it } from "vitest";

import {
  ARENA_PERMANENT_WIDTH,
  arenaLaneZoneLayouts,
  assignArenaOpponentSeats,
  layoutArenaSeat,
  spreadPositions,
  type ArenaLaneZoneLayout,
  type ArenaSeat,
} from "../arenaLayout.ts";
import type { GroupedPermanent } from "../../../viewmodel/battlefieldProps.ts";
import type { PlayerBattlefieldView } from "../../../viewmodel/gameStateView.ts";

function permanent(id: number): GroupedPermanent {
  return {
    ids: [id],
    count: 1,
  } as GroupedPermanent;
}

function singlePermanentInEachLane(): PlayerBattlefieldView {
  return {
    creatures: [permanent(1)],
    support: [permanent(2)],
    lands: [permanent(3)],
    planeswalkers: [],
    other: [],
  };
}

function crowdedBattlefieldView(): PlayerBattlefieldView {
  return {
    creatures: Array.from({ length: 5 }, (_, index) => permanent(index + 1)),
    support: Array.from({ length: 5 }, (_, index) => permanent(index + 11)),
    lands: Array.from({ length: 5 }, (_, index) => permanent(index + 21)),
    planeswalkers: [],
    other: [],
  };
}

describe("spreadPositions", () => {
  it("centers a single permanent", () => {
    expect(spreadPositions(1, 8)).toEqual([0]);
  });

  it("keeps a crowded lane centered within the available width", () => {
    const positions = spreadPositions(9, 8);

    expect(positions).toHaveLength(9);
    expect(positions[0]).toBe(-4);
    expect(positions[positions.length - 1]).toBe(4);
    expect(positions[4]).toBe(0);
  });

  it("uses a readable maximum gap for sparse lanes", () => {
    expect(spreadPositions(3, 20)).toEqual([-2.02, 0, 2.02]);
  });
});

describe("assignArenaOpponentSeats", () => {
  it("places a four-player pod around the viewer in stable seat order", () => {
    expect(assignArenaOpponentSeats([0, 1, 2, 3], 2, [0, 1, 3])).toEqual([
      { playerId: 3, seat: "left" },
      { playerId: 0, seat: "far" },
      { playerId: 1, seat: "right" },
    ]);
  });

  it("does not shift surviving players when the far seat is eliminated", () => {
    expect(assignArenaOpponentSeats([0, 1, 2, 3], 2, [1, 3])).toEqual([
      { playerId: 3, seat: "left" },
      { playerId: 1, seat: "right" },
    ]);
  });

  it("balances a three-player table across the diagonal seats", () => {
    expect(assignArenaOpponentSeats([0, 1, 2], 0, [1, 2])).toEqual([
      { playerId: 1, seat: "left" },
      { playerId: 2, seat: "right" },
    ]);
  });
});

describe("four-player pod footprint", () => {
  it("keeps every seat in a non-overlapping rectangular footprint", () => {
    const seats: ArenaSeat[] = ["local", "far", "left", "right"];
    const bounds = Object.fromEntries(
      seats.map((seat) => [
        seat,
        zoneBounds(arenaLaneZoneLayouts(seat, "pod", "inward")),
      ]),
    );

    expect(bounds.left.maxX).toBeLessThan(bounds.local.minX);
    expect(bounds.right.minX).toBeGreaterThan(bounds.local.maxX);
    expect(bounds.left.maxX).toBeLessThan(bounds.far.minX);
    expect(bounds.right.minX).toBeGreaterThan(bounds.far.maxX);
    expect(bounds.far.maxZ).toBeLessThan(bounds.local.minZ);
  });

  it.each(["inward", "kitchen"] as const)(
    "keeps crowded card edges inside every %s lane rectangle",
    (presentation) => {
      const view = crowdedBattlefieldView();
      const seats: ArenaSeat[] = ["local", "far", "left", "right"];

      for (const seat of seats) {
        const zones = arenaLaneZoneLayouts(seat, "pod", presentation);
        const placements = layoutArenaSeat(view, seat, "pod", presentation);
        for (const placement of placements) {
          const zone = zones.find(({ lane }) => lane === placement.lane);
          expect(zone).toBeDefined();
          if (!zone) continue;
          const deltaX = placement.position[0] - zone.position[0];
          const deltaZ = placement.position[2] - zone.position[2];
          const tangentOffset =
            deltaX * Math.cos(zone.faceAngle)
            - deltaZ * Math.sin(zone.faceAngle);
          expect(
            Math.abs(tangentOffset) + ARENA_PERMANENT_WIDTH / 2,
          ).toBeLessThanOrEqual(zone.width / 2 + Number.EPSILON);
        }
      }
    },
  );

  it("points diagonal side seats toward the center and local battlefield", () => {
    const view = singlePermanentInEachLane();
    const left = layoutArenaSeat(view, "left", "pod");
    const right = layoutArenaSeat(view, "right", "pod");
    const leftByLane = Object.fromEntries(
      left.map((placement) => [placement.lane, placement]),
    );
    const rightByLane = Object.fromEntries(
      right.map((placement) => [placement.lane, placement]),
    );

    expect(Math.abs(leftByLane.lands.position[0])).toBeGreaterThan(
      Math.abs(leftByLane.support.position[0]),
    );
    expect(Math.abs(leftByLane.support.position[0])).toBeGreaterThan(
      Math.abs(leftByLane.creatures.position[0]),
    );
    expect(leftByLane.creatures.position[2]).toBeGreaterThan(
      leftByLane.support.position[2],
    );
    expect(leftByLane.support.position[2]).toBeGreaterThan(
      leftByLane.lands.position[2],
    );
    expect(leftByLane.lands.position[0]).toBe(
      -rightByLane.lands.position[0],
    );
    expect(leftByLane.creatures.attackVector[0]).toBeGreaterThan(0);
    expect(rightByLane.creatures.attackVector[0]).toBeLessThan(0);
    expect(leftByLane.creatures.attackVector[1]).toBeGreaterThan(0);
    expect(rightByLane.creatures.attackVector[1]).toBeGreaterThan(0);
  });

  it("uses cardinal side seats in the kitchen-table alternative", () => {
    const view = singlePermanentInEachLane();
    const left = layoutArenaSeat(view, "left", "pod", "kitchen");
    const right = layoutArenaSeat(view, "right", "pod", "kitchen");

    expect(left[0].faceAngle).toBe(-Math.PI / 2);
    expect(right[0].faceAngle).toBe(Math.PI / 2);
    expect(left[0].attackVector[0]).toBe(1);
    expect(left[0].attackVector[1]).toBeCloseTo(0);
    expect(right[0].attackVector[0]).toBe(-1);
    expect(right[0].attackVector[1]).toBeCloseTo(0);
  });
});

function zoneBounds(zones: ArenaLaneZoneLayout[]) {
  return zones.reduce(
    (bounds, zone) => {
      const halfX =
        Math.abs(Math.cos(zone.faceAngle)) * zone.width / 2
        + Math.abs(Math.sin(zone.faceAngle)) * zone.depth / 2;
      const halfZ =
        Math.abs(Math.sin(zone.faceAngle)) * zone.width / 2
        + Math.abs(Math.cos(zone.faceAngle)) * zone.depth / 2;
      return {
        minX: Math.min(bounds.minX, zone.position[0] - halfX),
        maxX: Math.max(bounds.maxX, zone.position[0] + halfX),
        minZ: Math.min(bounds.minZ, zone.position[2] - halfZ),
        maxZ: Math.max(bounds.maxZ, zone.position[2] + halfZ),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}
