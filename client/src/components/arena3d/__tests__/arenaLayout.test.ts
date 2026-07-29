import { describe, expect, it } from "vitest";

import {
  ARENA_CARD_DEPTH,
  ARENA_CARD_WIDTH,
  arenaLaneZoneLayouts,
  arenaZoneLayout,
  assignArenaOpponentSeats,
  fitArenaLaneCards,
  layoutArenaSeat,
  spreadPositions,
  type ArenaPlacement,
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

function battlefieldWithLaneCount(count: number): PlayerBattlefieldView {
  return {
    creatures: Array.from({ length: count }, (_, index) => permanent(index + 1)),
    support: Array.from({ length: count }, (_, index) => permanent(index + 11)),
    lands: Array.from({ length: count }, (_, index) => permanent(index + 21)),
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

describe("fitArenaLaneCards", () => {
  it("uses portrait proportions for untapped battlefield cards", () => {
    expect(ARENA_CARD_DEPTH).toBeGreaterThan(ARENA_CARD_WIDTH);
  });

  it("keeps an uncrowded battlefield card at the shared zone-card size", () => {
    expect(fitArenaLaneCards(1, 3.2).cardScale).toBe(1);
  });

  it("shrinks crowded cards while preserving a visible gap", () => {
    const fit = fitArenaLaneCards(7, 3.2);
    const rotationFootprint =
      Math.max(ARENA_CARD_WIDTH, ARENA_CARD_DEPTH) * fit.cardScale;

    expect(fit.cardScale).toBeLessThan(1);
    expect(fit.gap).toBeGreaterThan(0);
    for (let index = 1; index < fit.offsets.length; index += 1) {
      expect(fit.offsets[index] - fit.offsets[index - 1]).toBeGreaterThan(
        rotationFootprint,
      );
    }
  });

  it("keeps even a very crowded lane non-overlapping", () => {
    const fit = fitArenaLaneCards(40, 3.2);
    const rotationFootprint =
      Math.max(ARENA_CARD_WIDTH, ARENA_CARD_DEPTH) * fit.cardScale;
    const occupiedWidth =
      rotationFootprint * 40 + fit.gap * (fit.offsets.length - 1);

    expect(fit.cardScale).toBeGreaterThan(0);
    expect(fit.gap).toBeGreaterThan(0);
    expect(occupiedWidth).toBeLessThan(3.2);
  });

  it("keeps each player's lane zones separated by base padding", () => {
    for (const presentation of ["inward", "kitchen"] as const) {
      for (const seat of ["local", "far", "left", "right"] as const) {
        const zones = arenaLaneZoneLayouts(seat, "pod", presentation);
        for (let index = 1; index < zones.length; index += 1) {
          const previous = zones[index - 1];
          const current = zones[index];
          const separation = Math.hypot(
            current.position[0] - previous.position[0],
            current.position[2] - previous.position[2],
          );
          expect(separation).toBeGreaterThan(previous.depth);
        }
      }
    }
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
  it.each(["inward", "kitchen"] as const)(
    "uses the library and graveyard as the %s side seats' final row",
    (presentation) => {
      for (const seat of ["left", "right"] as const) {
        const placements = layoutArenaSeat(
          singlePermanentInEachLane(),
          seat,
          "pod",
          presentation,
        );
        const piles = arenaZoneLayout(seat, "pod", presentation);
        const battlefieldRow = Math.max(
          ...placements.map(({ position }) => Math.abs(position[0])),
        );
        const pileRow = Math.min(
          Math.abs(piles.library[0]),
          Math.abs(piles.graveyard[0]),
        );

        expect(pileRow).toBeGreaterThan(battlefieldRow);
      }
    },
  );

  it("keeps kitchen side seats inside the table with piles as the final row", () => {
    const kitchenTableHalfWidth = 17.2 / 2;
    for (const seat of ["left", "right"] as const) {
      const placements = layoutArenaSeat(
        battlefieldWithLaneCount(3),
        seat,
        "pod",
        "kitchen",
      );
      const piles = arenaZoneLayout(seat, "pod", "kitchen");
      const battlefieldOuterEdge = Math.max(
        ...placements.map(
          ({ position, cardScale }) =>
            Math.abs(position[0]) + ARENA_CARD_DEPTH * cardScale / 2,
        ),
      );
      const pileInnerEdge = Math.min(
        Math.abs(piles.library[0]),
        Math.abs(piles.graveyard[0]),
      ) - ARENA_CARD_DEPTH / 2;

      expect(battlefieldOuterEdge).toBeLessThan(pileInnerEdge);
      for (const position of [
        ...placements.map(({ position }) => position),
        piles.library,
        piles.graveyard,
        piles.exile,
      ]) {
        expect(
          Math.abs(position[0]) + ARENA_CARD_DEPTH / 2,
        ).toBeLessThan(kitchenTableHalfWidth);
      }
    }
  });

  it.each(["inward", "kitchen"] as const)(
    "keeps sparse full-size cards separated across %s seat boundaries",
    (presentation) => {
      const seatViews: [ArenaSeat, PlayerBattlefieldView][] = [
        ["local", battlefieldWithLaneCount(3)],
        ["far", battlefieldWithLaneCount(3)],
        ["left", battlefieldWithLaneCount(1)],
        ["right", battlefieldWithLaneCount(1)],
      ];
      const placements = seatViews.flatMap(([seat, view]) =>
        layoutArenaSeat(view, seat, "pod", presentation)
          .map((placement) => ({ placement, seat })),
      );

      for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < placements.length;
          rightIndex += 1
        ) {
          const left = placements[leftIndex];
          const right = placements[rightIndex];
          if (left.seat === right.seat) continue;
          for (const leftTapped of [false, true]) {
            for (const rightTapped of [false, true]) {
              expect(
                cardsHaveVisualPadding(
                  left.placement,
                  leftTapped,
                  right.placement,
                  rightTapped,
                ),
                JSON.stringify({
                  left: {
                    seat: left.seat,
                    lane: left.placement.lane,
                    tapped: leftTapped,
                  },
                  right: {
                    seat: right.seat,
                    lane: right.placement.lane,
                    tapped: rightTapped,
                  },
                }),
              ).toBe(true);
            }
          }
        }
      }
    },
  );

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
            Math.abs(tangentOffset)
              + Math.max(ARENA_CARD_WIDTH, ARENA_CARD_DEPTH)
                * placement.cardScale
                / 2,
          ).toBeLessThanOrEqual(zone.width / 2 + Number.EPSILON);
          expect(
            ARENA_CARD_DEPTH * placement.cardScale,
          ).toBeLessThan(zone.depth);
        }
      }
    },
  );

  it.each(["inward", "kitchen"] as const)(
    "anchors sparse opponent land and support rows to their %s inner edges",
    (presentation) => {
      for (const seat of ["far", "left", "right"] as const) {
        const zones = arenaLaneZoneLayouts(seat, "pod", presentation);
        const sparse = layoutArenaSeat(
          singlePermanentInEachLane(),
          seat,
          "pod",
          presentation,
        );
        const crowded = layoutArenaSeat(
          crowdedBattlefieldView(),
          seat,
          "pod",
          presentation,
        );

        for (const lane of ["support", "lands"] as const) {
          const zone = zones.find((candidate) => candidate.lane === lane);
          const sparseCard = sparse.find(
            (placement) => placement.lane === lane,
          );
          const crowdedCards = crowded.filter(
            (placement) => placement.lane === lane,
          );
          expect(zone).toBeDefined();
          expect(sparseCard).toBeDefined();
          if (!zone || !sparseCard) continue;

          const tangent: [number, number] = [
            Math.cos(zone.faceAngle),
            -Math.sin(zone.faceAngle),
          ];
          const sparseOffset = dot(
            [
              sparseCard.position[0] - zone.position[0],
              sparseCard.position[2] - zone.position[2],
            ],
            tangent,
          );
          const towardOrigin = dot(
            [-zone.position[0], -zone.position[2]],
            tangent,
          );
          const crowdedAverage =
            crowdedCards.reduce((sum, placement) => sum + dot(
              [
                placement.position[0] - zone.position[0],
                placement.position[2] - zone.position[2],
              ],
              tangent,
            ), 0)
            / crowdedCards.length;

          expect(sparseOffset * towardOrigin).toBeGreaterThan(0);
          expect(Math.abs(sparseOffset)).toBeGreaterThan(0.25);
          expect(crowdedAverage).toBeCloseTo(0);
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

    expect(Math.abs(leftByLane.support.position[0])).toBeGreaterThan(
      Math.abs(leftByLane.creatures.position[0]),
    );
    expect(Math.abs(leftByLane.lands.position[0])).toBeGreaterThan(
      Math.abs(leftByLane.creatures.position[0]),
    );
    expect(leftByLane.support.position[2]).toBeGreaterThan(
      leftByLane.creatures.position[2],
    );
    expect(leftByLane.creatures.position[2]).toBeGreaterThan(
      leftByLane.lands.position[2],
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

describe("two-player battlefield footprint", () => {
  it("keeps full-size cards separated across both duel seats", () => {
    const seatViews: [ArenaSeat, PlayerBattlefieldView][] = [
      ["local", battlefieldWithLaneCount(3)],
      ["far", battlefieldWithLaneCount(3)],
    ];
    const placements = seatViews.flatMap(([seat, view]) =>
      layoutArenaSeat(view, seat, "duel")
        .map((placement) => ({ placement, seat })),
    );

    for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < placements.length;
        rightIndex += 1
      ) {
        const left = placements[leftIndex];
        const right = placements[rightIndex];
        if (left.seat === right.seat) continue;
        for (const leftTapped of [false, true]) {
          for (const rightTapped of [false, true]) {
            expect(
              cardsHaveVisualPadding(
                left.placement,
                leftTapped,
                right.placement,
                rightTapped,
              ),
            ).toBe(true);
          }
        }
      }
    }
  });
});

function cardsHaveVisualPadding(
  left: ArenaPlacement,
  leftTapped: boolean,
  right: ArenaPlacement,
  rightTapped: boolean,
): boolean {
  const padding = 0.04;
  const leftRect = cardRectangle(left, leftTapped);
  const rightRect = cardRectangle(right, rightTapped);
  const centerDelta: [number, number] = [
    right.position[0] - left.position[0],
    right.position[2] - left.position[2],
  ];

  return [...leftRect.axes, ...rightRect.axes].some((axis) => {
    const centerDistance = Math.abs(dot(centerDelta, axis));
    const leftRadius =
      leftRect.halfWidth * Math.abs(dot(leftRect.axes[0], axis))
      + leftRect.halfDepth * Math.abs(dot(leftRect.axes[1], axis));
    const rightRadius =
      rightRect.halfWidth * Math.abs(dot(rightRect.axes[0], axis))
      + rightRect.halfDepth * Math.abs(dot(rightRect.axes[1], axis));
    return centerDistance >= leftRadius + rightRadius + padding;
  });
}

function cardRectangle(placement: ArenaPlacement, tapped: boolean) {
  const angle = placement.faceAngle + (tapped ? Math.PI / 2 : 0);
  return {
    axes: [
      [Math.cos(angle), -Math.sin(angle)],
      [Math.sin(angle), Math.cos(angle)],
    ] as [[number, number], [number, number]],
    halfWidth: ARENA_CARD_WIDTH * placement.cardScale / 2,
    halfDepth: ARENA_CARD_DEPTH * placement.cardScale / 2,
  };
}

function dot(left: [number, number], right: [number, number]): number {
  return left[0] * right[0] + left[1] * right[1];
}
