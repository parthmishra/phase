import { describe, expect, it } from "vitest";

import {
  assignArenaOpponentSeats,
  layoutArenaSeat,
  spreadPositions,
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
  it("recedes side players inward from the broad local edge", () => {
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
    expect(leftByLane.lands.position[2]).toBeGreaterThan(
      leftByLane.support.position[2],
    );
    expect(leftByLane.support.position[2]).toBeGreaterThan(
      leftByLane.creatures.position[2],
    );
    expect(leftByLane.lands.position[0]).toBe(
      -rightByLane.lands.position[0],
    );
    expect(leftByLane.creatures.attackVector[1]).toBeLessThan(0);
    expect(rightByLane.creatures.attackVector[1]).toBeLessThan(0);
  });
});
