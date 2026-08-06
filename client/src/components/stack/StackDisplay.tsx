import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { StackEntry } from "./StackEntry.tsx";
import { pressureMultiplier } from "../../utils/stackPressure.ts";
import { effectiveStackPressure } from "../../utils/stackThroughput.ts";
import { StackTargetArcs } from "./StackTargetArcs.tsx";
import { useGameStore } from "../../stores/gameStore.ts";
import { usePreferencesStore } from "../../stores/preferencesStore.ts";
import type { MultiplayerBoardLayout } from "../../stores/preferencesStore.ts";
import type { ObjectId, StackDisplayGroup, StackEntry as StackEntryType, StackEntryDisplay } from "../../adapter/types.ts";
import { getStackCardSize } from "../board/boardSizing.ts";
import { DraggableWidget } from "../flexlayout/DraggableWidget.tsx";

const EMPTY_STACK: StackEntryType[] = [];
const EMPTY_GROUPS: StackDisplayGroup[] = [];
const EMPTY_DETAILS: Record<string, StackEntryDisplay> = {};

const STAGGER_Y = 20;
const STAGGER_X = 8;
const MAX_VISIBLE_STACK_DEPTH = 4;
const VERTICAL_VIEWPORT_INSET = 12;

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function StackDisplay({
  effectiveMultiplayerBoardLayout: _effectiveMultiplayerBoardLayout,
}: {
  effectiveMultiplayerBoardLayout?: MultiplayerBoardLayout;
} = {}) {
  const gameState = useGameStore((s) => s.gameState);
  const stack = gameState?.stack ?? EMPTY_STACK;
  // Engine-authored stack grouping rides on the same state snapshot that
  // carries `state.stack` (see `engine::game::derived_views`). Reading
  // directly from the selector makes the grouped view atomically
  // consistent with the stack it describes — no async RPC, no race guard,
  // no generation counter. Absent `derived` (legacy cached state) falls
  // through to one-per-entry rendering below.
  const groups = useGameStore(
    (s) => s.gameState?.derived?.stack_display_groups ?? EMPTY_GROUPS,
  );
  const stackEntryDetails = useGameStore(
    (s) => s.gameState?.derived?.stack_entry_details ?? EMPTY_DETAILS,
  );
  const [viewport, setViewport] = useState(getViewportSize);
  const [hoveredStackEntryId, setHoveredStackEntryId] = useState<ObjectId | null>(null);
  // User-chosen dock edge. Lives in preferences (not local state) because this
  // component unmounts whenever the stack empties — local state would reset the
  // choice on every resolution.
  const stackDockSide = usePreferencesStore((s) => s.stackDockSide);
  const dockedLeft = stackDockSide === "left";
  // User size multiplier over the viewport-derived auto-scale (absent ⇒ 1).
  // Cards derive width AND height from one scale, so this stays aspect-correct.
  const userStackScale = usePreferencesStore((s) => s.flexLayout.scales?.stack) ?? 1;

  useEffect(() => {
    function handleResize() {
      setViewport(getViewportSize());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const activeStackEntryId = hoveredStackEntryId ?? stack[stack.length - 1]?.id ?? null;

  const handleStackEntryHover = useCallback((entryId: ObjectId, hovered: boolean) => {
    setHoveredStackEntryId(hovered ? entryId : null);
  }, []);

  if (stack.length === 0) return null;

  // When engine-authored groups are available and actually coalesce anything,
  // render one entry per group (with ×N badge) instead of per raw entry.
  // Falling back to the raw stack when groups are unavailable preserves the
  // prior behavior for adapters that don't proxy the call yet.
  const entryById = new Map(stack.map((e) => [e.id, e] as const));
  const groupedStack: { entry: StackEntryType; count: number }[] =
    groups.length > 0 && groups.some((g) => g.count > 1)
      ? groups
          .map((g) => {
            const entry = entryById.get(g.representative);
            return entry ? { entry, count: g.count } : null;
          })
          .filter((x): x is { entry: StackEntryType; count: number } => x !== null)
      : stack.map((entry) => ({ entry, count: 1 }));
  const displayStack = groupedStack.map((g) => g.entry);
  const stackEntryRepresentatives = new Map<ObjectId, ObjectId>();
  for (const group of groups) {
    for (const memberId of group.member_ids) {
      stackEntryRepresentatives.set(memberId, group.representative);
    }
  }
  const rawCardSize = getStackCardSize(displayStack.length);
  const widthScale =
    viewport.width < 640 ? 0.58 :
      viewport.width < 1024 ? 0.72 :
        viewport.width < 1440 ? 0.86 : 1;
  const heightScale = viewport.height < 820 ? 0.9 : 1;
  const responsiveScale = widthScale * heightScale * userStackScale;
  const cardSize = {
    width: Math.max(118, Math.round(rawCardSize.width * responsiveScale)),
    height: Math.max(165, Math.round(rawCardSize.height * responsiveScale)),
  };
  const staggerX = viewport.width < 768 ? 5 : STAGGER_X;
  const staggerY = viewport.width < 768 ? 15 : STAGGER_Y;
  const visibleDepth = Math.min(
    Math.max(displayStack.length - 1, 0),
    MAX_VISIBLE_STACK_DEPTH,
  );
  const pileWidth = cardSize.width + staggerX * visibleDepth;
  const pileHeight = cardSize.height + staggerY * visibleDepth;
  const edgeInset =
    viewport.width < 640 ? 14 :
      viewport.width < 1024 ? 28 :
        viewport.width < 1440 ? 44 : 64;
  const centerY = viewport.height * (viewport.width < 768 ? 0.39 : 0.44);
  const pileTop = Math.min(
    Math.max(centerY - cardSize.height / 2, VERTICAL_VIEWPORT_INSET),
    Math.max(
      VERTICAL_VIEWPORT_INSET,
      viewport.height - pileHeight - VERTICAL_VIEWPORT_INSET,
    ),
  );
  const pileAnchorStyle = dockedLeft
    ? {
        top: pileTop,
        left: `calc(env(safe-area-inset-left) + ${edgeInset}px)`,
      }
    : {
        top: pileTop,
        right: `calc(env(safe-area-inset-right) + ${edgeInset}px)`,
      };

  const entryStyles = displayStack.map((_, index) => {
    const visualIndex =
      displayStack.length <= MAX_VISIBLE_STACK_DEPTH + 1
        ? index
        : index * MAX_VISIBLE_STACK_DEPTH / (displayStack.length - 1);
    return {
    position: "absolute" as const,
    top: visualIndex * staggerY,
    left: visualIndex * staggerX,
    zIndex: index + 1,
    };
  });

  return (
    // The stack is a floating pile of the actual game pieces, not a second
    // dashboard describing them. DraggableWidget preserves the player's saved
    // position/scale preference without introducing panel chrome.
    <DraggableWidget
      target={{ kind: "widget", key: "stackPanel" }}
      flexZone="stackPanel"
      className="pointer-events-none fixed z-[35]"
      style={pileAnchorStyle}
      scaleKey="stack"
      resizeCorner={dockedLeft ? "br" : "bl"}
    >
      <AnimatePresence>
        <motion.div
          key="stack-container"
          initial={{ opacity: 0, x: dockedLeft ? -34 : 34, scale: 0.94 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dockedLeft ? -34 : 34, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 250, damping: 26 }}
          className="pointer-events-none relative"
          style={{ width: pileWidth, height: pileHeight }}
        >
          {stack.length > 1 && (
            <span
              aria-hidden
              className="absolute -right-2 -top-2 z-[100] flex h-7 min-w-7 items-center justify-center rounded-full border border-amber-100/35 bg-stone-950/94 px-1.5 text-[11px] font-black tabular-nums text-amber-100 shadow-[0_6px_18px_rgba(0,0,0,0.55)]"
            >
              {stack.length}
            </span>
          )}
          <AnimatePresence mode="popLayout">
            {(() => {
              const pacing = pressureMultiplier(
                effectiveStackPressure(displayStack.length),
              );
              return groupedStack.map(({ entry, count }, index) => (
                <StackEntry
                  key={entry.id}
                  entry={entry}
                  index={index}
                  isTop={index === displayStack.length - 1}
                  isPending={stackEntryDetails[String(entry.id)]?.is_pending}
                  cardSize={cardSize}
                  onHoverChange={(hovered) => handleStackEntryHover(entry.id, hovered)}
                  style={entryStyles[index]}
                  pacingMultiplier={pacing}
                  groupCount={count}
                  details={stackEntryDetails[String(entry.id)]}
                />
              ));
            })()}
          </AnimatePresence>
          <StackTargetArcs
            stack={displayStack}
            activeEntryId={activeStackEntryId}
            isCollapsed={false}
            detailsByEntry={stackEntryDetails}
            stackEntryRepresentatives={stackEntryRepresentatives}
          />
        </motion.div>
      </AnimatePresence>
    </DraggableWidget>
  );
}
