import { describe, expect, it } from "vitest";

import {
  ARENA_CARD_DEPTH,
  ARENA_MAX_VISIBLE_HELD_CARDS,
  ARENA_TAPPED_CARD_FOOTPRINT,
  ARENA_CARD_WIDTH,
  arenaHeldCardFan,
  arenaHeldCommanderRow,
  arenaHeldHandLayout,
  arenaVisibleHeldCardCount,
  arenaLaneZoneLayouts,
  arenaZoneLayout,
  assignArenaOpponentSeats,
  fitArenaLaneCards,
  layoutArenaSeat,
  spreadPositions,
  type ArenaPlacement,
  type ArenaSeat,
  type ArenaLaneZoneLayout,
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

describe("arenaHeldCardFan", () => {
  it("clusters a single card over the implied grip", () => {
    expect(arenaHeldCardFan(1)).toEqual([
      {
        x: 0,
        y: 0.13,
        z: 0,
        rotationZ: -0,
        scale: 0.88,
      },
    ]);
  });

  it("keeps a large hand bounded while preserving individual cards", () => {
    const fan = arenaHeldCardFan(20);

    expect(fan).toHaveLength(20);
    expect(fan[0].x).toBeGreaterThanOrEqual(-1.8);
    expect(fan[fan.length - 1].x).toBeLessThanOrEqual(1.8);
    expect(fan[0].rotationZ).toBeGreaterThan(0);
    expect(fan[fan.length - 1].rotationZ).toBeLessThan(0);
    expect(fan.every((card) => card.scale === 0.68)).toBe(true);
  });

  it("caps the rendered opponent fan at the seven-card presentation capacity", () => {
    expect(ARENA_MAX_VISIBLE_HELD_CARDS).toBe(7);
    expect(arenaVisibleHeldCardCount(5)).toBe(5);
    expect(arenaVisibleHeldCardCount(7)).toBe(7);
    expect(arenaVisibleHeldCardCount(12)).toBe(7);
  });
});

describe("arenaHeldCommanderRow", () => {
  it("continues the hand plane immediately after the visible fan", () => {
    const hand = arenaHeldCardFan(7);
    const commanders = arenaHeldCommanderRow(7, 2);

    expect(commanders).toHaveLength(2);
    expect(commanders[0].x).toBeGreaterThan(hand[hand.length - 1].x);
    expect(commanders[1].x).toBeGreaterThan(commanders[0].x);
    expect(commanders.every((card) => card.rotationZ === 0)).toBe(true);
    expect(commanders.every((card) => card.scale === 0.84)).toBe(true);
  });
});

describe("arenaHeldHandLayout", () => {
  it("faces every opponent hand toward the table center", () => {
    expect(arenaHeldHandLayout("far").faceAngle).toBe(0);
    expect(arenaHeldHandLayout("left", "pod").faceAngle).toBe(Math.PI / 2);
    expect(arenaHeldHandLayout("right", "pod").faceAngle).toBe(-Math.PI / 2);
  });

  it("keeps the far hand centered and visible inside the authored seat edge", () => {
    expect(arenaHeldHandLayout("far", "pod").position[0]).toBe(0);
    expect(arenaHeldHandLayout("far", "pod").position[2]).toBeGreaterThan(-5.5);
    expect(arenaHeldHandLayout("far", "pod").position[2]).toBeLessThan(-4.5);
  });

  it("lowers the far hand into view on short landscape screens", () => {
    const wide = arenaHeldHandLayout("far", "pod", "wide");
    const compact = arenaHeldHandLayout("far", "pod", "compact");

    expect(compact.position[1]).toBeLessThan(wide.position[1]);
    expect(compact.position[2]).toBeGreaterThan(wide.position[2]);
    expect(compact.scale).toBe(wide.scale);
  });

  it("mirrors side hands across one battlefield centerline", () => {
    const left = arenaHeldHandLayout("left", "pod");
    const right = arenaHeldHandLayout("right", "pod");

    expect(left.position[0]).toBe(-right.position[0]);
    expect(left.position[2]).toBe(0);
    expect(right.position[2]).toBe(0);
    expect(left.position[1]).toBe(right.position[1]);
    expect(left.scale).toBe(right.scale);
    expect(left.faceAngle).toBe(-right.faceAngle);
  });

  it("keeps pod side hands on their authored seat edges", () => {
    expect(arenaHeldHandLayout("left", "pod").position[0]).toBeLessThan(-8);
    expect(arenaHeldHandLayout("right", "pod").position[0]).toBeGreaterThan(8);
  });

  it("elevates opponent hands and keeps side fans near library scale", () => {
    for (const seat of ["far", "left", "right"] as const) {
      const layout = arenaHeldHandLayout(seat, "pod");
      expect(layout.position[1]).toBeGreaterThanOrEqual(1);
    }
    expect(arenaHeldHandLayout("left", "pod").scale).toBeGreaterThanOrEqual(
      0.8,
    );
    expect(arenaHeldHandLayout("right", "pod").scale).toBeGreaterThanOrEqual(
      0.8,
    );
  });
});

describe("fitArenaLaneCards", () => {
  it("uses portrait proportions for untapped battlefield cards", () => {
    expect(ARENA_CARD_DEPTH).toBeGreaterThan(ARENA_CARD_WIDTH);
  });

  it("keeps an uncrowded battlefield card at the shared zone-card size", () => {
    expect(fitArenaLaneCards(1, 3.2).cardScale).toBe(1);
  });

  it("uses overlap before aggressive shrinking on crowded lanes", () => {
    const fit = fitArenaLaneCards(7, 3.2);
    const cardWidth = ARENA_CARD_WIDTH * fit.cardScale;

    expect(fit.cardScale).toBeLessThan(1);
    expect(fit.cardScale).toBeGreaterThanOrEqual(0.82);
    expect(fit.gap).toBeGreaterThan(0);
    for (let index = 1; index < fit.offsets.length; index += 1) {
      expect(fit.offsets[index] - fit.offsets[index - 1]).toBeLessThan(
        cardWidth,
      );
    }
  });

  it("keeps even a very crowded lane readable and inside its lane", () => {
    const fit = fitArenaLaneCards(40, 3.2);
    const cardWidth = ARENA_CARD_WIDTH * fit.cardScale;
    const occupiedWidth =
      fit.offsets[fit.offsets.length - 1] - fit.offsets[0] + cardWidth;

    expect(fit.cardScale).toBeGreaterThanOrEqual(0.7);
    expect(fit.gap).toBeGreaterThan(0);
    expect(occupiedWidth).toBeLessThan(3.2);
  });

  it("keeps each player's lane zones separated by base padding", () => {
    for (const seat of ["local", "far", "left", "right"] as const) {
      const zones = arenaLaneZoneLayouts(seat, "pod");
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
  it("keeps every player's playable rectangles disjoint", () => {
    const seats: ArenaSeat[] = ["local", "far", "left", "right"];
    const zones = seats.flatMap((seat) =>
      arenaLaneZoneLayouts(seat, "pod").map((zone) => ({
        seat,
        zone,
      })),
    );
    const overlaps: string[] = [];

    for (let leftIndex = 0; leftIndex < zones.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < zones.length;
        rightIndex += 1
      ) {
        const left = zones[leftIndex];
        const right = zones[rightIndex];
        if (!zonesHaveVisualPadding(left.zone, right.zone)) {
          overlaps.push(
            JSON.stringify({
              left: { seat: left.seat, lane: left.zone.lane },
              right: { seat: right.seat, lane: right.zone.lane },
            }),
          );
        }
      }
    }

    expect(overlaps).toEqual([]);
  });

  it("keeps every pile footprint outside all playable rectangles", () => {
    const seats: ArenaSeat[] = ["local", "far", "left", "right"];
    const playableZones = seats.flatMap((seat) =>
      arenaLaneZoneLayouts(seat, "pod").map((zone) => ({
        seat,
        zone,
      })),
    );
    const piles = seats.flatMap((seat) => {
      const layout = arenaZoneLayout(seat, "pod");
      return (["library", "graveyard", "exile"] as const).map((zone) => ({
        seat,
        zone,
        rectangle: pileRectangle(layout[zone], layout.faceAngle),
      }));
    });
    const overlaps: string[] = [];

    for (const pile of piles) {
      for (const playable of playableZones) {
        if (
          !rectanglesHaveVisualPadding(
            pile.rectangle,
            zoneRectangle(playable.zone),
          )
        ) {
          overlaps.push(
            JSON.stringify({
              pile: { seat: pile.seat, zone: pile.zone },
              playable: {
                seat: playable.seat,
                lane: playable.zone.lane,
              },
            }),
          );
        }
      }
    }

    expect(overlaps).toEqual([]);
  });

  it("keeps the local support and land row clear of the near-edge nameplate", () => {
    const zones = arenaLaneZoneLayouts("local", "pod");
    const creatures = zones.find(({ lane }) => lane === "creatures");
    const support = zones.find(({ lane }) => lane === "support");
    const lands = zones.find(({ lane }) => lane === "lands");

    expect(creatures).toBeDefined();
    expect(support).toBeDefined();
    expect(lands).toBeDefined();
    if (!creatures || !support || !lands) return;

    expect(support.position[2]).toBeGreaterThan(2);
    expect(support.position[2]).toBeLessThan(3);
    expect(lands.position[2]).toBe(support.position[2]);
    expect(support.position[2]).toBeGreaterThan(creatures.position[2]);
    expect(lands.position[0]).toBeLessThan(0);
    expect(support.position[0]).toBeGreaterThan(0);
  });

  it("uses the library and graveyard as the side seats' final row", () => {
    for (const seat of ["left", "right"] as const) {
      const placements = layoutArenaSeat(
        singlePermanentInEachLane(),
        seat,
        "pod",
      );
      const piles = arenaZoneLayout(seat, "pod");
      const battlefieldRow = Math.max(
        ...placements.map(({ position }) => Math.abs(position[0])),
      );
      const pileRow = Math.min(
        Math.abs(piles.library[0]),
        Math.abs(piles.graveyard[0]),
      );

      expect(pileRow).toBeGreaterThan(battlefieldRow);
    }
  });

  it("keeps side seats inside the table with piles as the final row", () => {
    const kitchenTableHalfWidth = 17.2 / 2;
    for (const seat of ["left", "right"] as const) {
      const placements = layoutArenaSeat(
        battlefieldWithLaneCount(3),
        seat,
        "pod",
      );
      const piles = arenaZoneLayout(seat, "pod");
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

  it("keeps sparse full-size cards separated across seat boundaries", () => {
    const seatViews: [ArenaSeat, PlayerBattlefieldView][] = [
      ["local", battlefieldWithLaneCount(3)],
      ["far", battlefieldWithLaneCount(3)],
      ["left", battlefieldWithLaneCount(1)],
      ["right", battlefieldWithLaneCount(1)],
    ];
    const placements = seatViews.flatMap(([seat, view]) =>
      layoutArenaSeat(view, seat, "pod")
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
  });

  it("keeps crowded card edges inside every lane rectangle", () => {
    const view = crowdedBattlefieldView();
    const seats: ArenaSeat[] = ["local", "far", "left", "right"];

    for (const seat of seats) {
      const zones = arenaLaneZoneLayouts(seat, "pod");
      const placements = layoutArenaSeat(view, seat, "pod");
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
            + ARENA_TAPPED_CARD_FOOTPRINT * placement.cardScale
              / 2,
        ).toBeLessThanOrEqual(zone.width / 2 + Number.EPSILON);
        expect(
          ARENA_CARD_DEPTH * placement.cardScale,
        ).toBeLessThan(zone.depth);
      }
    }
  });

  it("starts every seat lane at its center and grows symmetrically outward", () => {
    for (const seat of ["local", "far", "left", "right"] as const) {
      const zones = arenaLaneZoneLayouts(seat, "pod");
      const single = layoutArenaSeat(
        singlePermanentInEachLane(),
        seat,
        "pod",
      );
      const growing = layoutArenaSeat(
        battlefieldWithLaneCount(3),
        seat,
        "pod",
      );

      for (const lane of ["creatures", "support", "lands"] as const) {
        const zone = zones.find((candidate) => candidate.lane === lane);
        const singleCard = single.find(
          (placement) => placement.lane === lane,
        );
        const growingCards = growing.filter(
          (placement) => placement.lane === lane,
        );
        expect(zone).toBeDefined();
        expect(singleCard).toBeDefined();
        if (!zone || !singleCard) continue;

        const tangent: [number, number] = [
          Math.cos(zone.faceAngle),
          -Math.sin(zone.faceAngle),
        ];
        const singleOffset = dot(
          [
            singleCard.position[0] - zone.position[0],
            singleCard.position[2] - zone.position[2],
          ],
          tangent,
        );
        const growingOffsets = growingCards.map((placement) =>
          dot(
            [
              placement.position[0] - zone.position[0],
              placement.position[2] - zone.position[2],
            ],
            tangent,
          ),
        );

        expect(singleOffset).toBeCloseTo(0);
        expect(growingOffsets[0]).toBeLessThan(0);
        expect(growingOffsets[1]).toBeCloseTo(0);
        expect(growingOffsets[2]).toBeGreaterThan(0);
        expect(growingOffsets[0]).toBeCloseTo(-growingOffsets[2]);
      }
    }
  });

  it("keeps adjacent side seats perpendicular", () => {
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
    expect(leftByLane.creatures.attackVector[1]).toBeCloseTo(0);
    expect(rightByLane.creatures.attackVector[1]).toBeCloseTo(0);
    expect(leftByLane.creatures.faceAngle).toBe(-Math.PI / 2);
    expect(rightByLane.creatures.faceAngle).toBe(Math.PI / 2);
  });

  it("uses cardinal side seats for the pod table", () => {
    const view = singlePermanentInEachLane();
    const left = layoutArenaSeat(view, "left", "pod");
    const right = layoutArenaSeat(view, "right", "pod");

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

function zonesHaveVisualPadding(
  left: ArenaLaneZoneLayout,
  right: ArenaLaneZoneLayout,
): boolean {
  return rectanglesHaveVisualPadding(
    zoneRectangle(left),
    zoneRectangle(right),
  );
}

interface TableRectangle {
  position: [number, number];
  axes: [[number, number], [number, number]];
  halfWidth: number;
  halfDepth: number;
}

function rectanglesHaveVisualPadding(
  leftRect: TableRectangle,
  rightRect: TableRectangle,
): boolean {
  const padding = 0.12;
  const centerDelta: [number, number] = [
    rightRect.position[0] - leftRect.position[0],
    rightRect.position[1] - leftRect.position[1],
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

function zoneRectangle(zone: ArenaLaneZoneLayout) {
  return {
    position: [zone.position[0], zone.position[2]] as [number, number],
    axes: [
      [Math.cos(zone.faceAngle), -Math.sin(zone.faceAngle)],
      [Math.sin(zone.faceAngle), Math.cos(zone.faceAngle)],
    ] as [[number, number], [number, number]],
    halfWidth: zone.width / 2,
    halfDepth: zone.depth / 2,
  };
}

function pileRectangle(
  position: [number, number, number],
  faceAngle: number,
): TableRectangle {
  return {
    position: [position[0], position[2]],
    axes: [
      [Math.cos(faceAngle), -Math.sin(faceAngle)],
      [Math.sin(faceAngle), Math.cos(faceAngle)],
    ],
    halfWidth: ARENA_CARD_WIDTH / 2,
    halfDepth: ARENA_CARD_DEPTH / 2,
  };
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
