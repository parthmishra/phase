import { useEffect, useState, type CSSProperties } from "react";

import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { CardArtFallback } from "../card/CardArtFallback.tsx";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { useIsMobile } from "../../hooks/useIsMobile.ts";
import { useLongPress } from "../../hooks/useLongPress.ts";
import { useCanActForWaitingState } from "../../hooks/usePlayerId.ts";
import { dispatchAction } from "../../game/dispatch.ts";
import { cardImageLookup, tokenFiltersForObject } from "../../services/cardImageLookup.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { useAnimationStore } from "../../stores/animationStore.ts";
import { useUiStore } from "../../stores/uiStore.ts";
import { getWaitingForObjectChoiceIds } from "../../viewmodel/gameStateView.ts";
import { renderDescription } from "../../utils/description.ts";
import { ManaCostPips } from "../mana/ManaCostPips.tsx";
import { PopoverMenu } from "../menu/PopoverMenu.tsx";
import { YieldMuteIcon } from "./YieldMuteIcon.tsx";
import { ArenaStackCardSurface } from "./ArenaStackCardSurface.tsx";
import type {
  ObjectId,
  StackEntry as StackEntryType,
  StackEntryDisplay,
  StackPaidFactView,
} from "../../adapter/types.ts";

interface StackEntryProps {
  entry: StackEntryType;
  index: number;
  isTop: boolean;
  isPending?: boolean;
  cardSize: { width: number; height: number };
  style?: CSSProperties;
  onHoverChange?: (hovered: boolean) => void;
  /**
   * Pacing multiplier for the stagger delay, sourced from the engine's
   * StackPressure (see utils/stackPressure.ts). 1.0 = Normal, 0 = Instant
   * (mount animation skipped). Defaults to 1.0 so callers that haven't
   * plumbed pressure keep the prior behavior.
   */
  pacingMultiplier?: number;
  /**
   * Engine-authored coalesce count (from `stack_display_groups`). When > 1,
   * renders a ×N badge on the representative card. Defaults to 1 so callers
   * that don't proxy group data keep the prior per-entry rendering.
   */
  groupCount?: number;
  /**
   * The engine-selected object identity for a compact coalesced group. The
   * visible card remains `entry`; choice membership and dispatch use this id.
   */
  choiceObjectId?: ObjectId;
  details?: StackEntryDisplay;
}

export function StackEntry({ entry, choiceObjectId = entry.id, index, isTop, isPending, cardSize, style, onHoverChange, pacingMultiplier = 1, groupCount = 1, details }: StackEntryProps) {
  const { t } = useTranslation("game");
  const isMobile = useIsMobile();
  const objects = useGameStore((s) => s.gameState?.objects);
  const waitingFor = useGameStore((s) => s.waitingFor);
  const canActForWaitingState = useCanActForWaitingState();
  const pendingCast = useGameStore((s) => s.gameState?.pending_cast);
  const isCardInFlight = useAnimationStore(
    (state) => state.inFlightObjectIds.has(entry.source_id),
  );
  const inspectObject = useUiStore((s) => s.inspectObject);

  const setPreviewSticky = useUiStore((s) => s.setPreviewSticky);
  const priorityYields = useGameStore((s) => s.gameState?.priority_yields);
  // CR 117.3d: a triggered ability can be pre-committed to auto-pass priority via
  // the always-visible yield pill rendered below (the menu it opens dispatches
  // SetPriorityYield through PopoverMenu). Long-press stays uniformly bound to
  // inspect-and-pin for every entry, so it never competes with the mobile
  // card-preview gesture and the yield control isn't a hidden gesture.
  const { handlers: longPressHandlers, firedRef: longPressFired } = useLongPress(() => {
    inspectObject(entry.source_id, undefined, "immediate");
    setPreviewSticky(true);
    onHoverChange?.(true);
  });

  const sourceObj = objects?.[entry.source_id];
  // Prefer the engine-pre-resolved source name on triggered abilities (so the
  // display layer doesn't dereference ObjectId -> GameObject -> name itself).
  // Fall back to the objects map for spells/activated entries that don't carry
  // a captured name.
  //
  // There is deliberately NO last-resort literal here. This line used to end in
  // `|| "Unknown"` for the rule-defined sourceless abilities this engine
  // constructs (CR 725.2 monarch, CR 726.2 initiative, CR 728.1 rad counters,
  // and CR 702.179d speed). CR 113.7 defines an ability's source; CR 113.8
  // instead defines its controller. (CR 901.8 separately gives Planechase's
  // planeswalking ability no source.) "Unknown" is game-facing text no rule
  // ever produced, invented by the display layer because the wire carried
  // nothing. The engine names those abilities now, so the invention has nothing
  // left to cover; if a name is ever missing again, an empty label is the honest
  // answer and the engine-side guard is what should fail.
  const triggerSourceName =
    entry.kind.type === "TriggeredAbility" ? entry.kind.data.source_name : undefined;
  const sourceName = details?.source_name || triggerSourceName || sourceObj?.name || "";
  const imageLookup = sourceObj
    ? cardImageLookup(sourceObj)
    : { name: "", faceIndex: 0, oracleId: undefined, faceName: undefined };
  const sourceIsToken = sourceObj?.display_source === "Token" || Boolean(details?.token_image_ref);
  const sourceTokenImageRef =
    sourceObj?.display_source === "Token" ? sourceObj.token_image_ref : details?.token_image_ref;

  const { src, isLoading } = useCardImage(sourceObj ? imageLookup.name : sourceName, {
    size: "normal",
    faceIndex: imageLookup.faceIndex,
    isToken: sourceIsToken,
    tokenFilters: sourceObj?.display_source === "Token" ? tokenFiltersForObject(sourceObj) : undefined,
    tokenImageRef: sourceTokenImageRef,
    oracleId: imageLookup.oracleId,
    faceName: imageLookup.faceName,
  });
  const [artError, setArtError] = useState(false);
  useEffect(() => setArtError(false), [src]);

  const isSpell = entry.kind.type === "Spell";
  const displayManaCost =
    isSpell && pendingCast?.object_id === entry.source_id
      ? pendingCast.cost
      : sourceObj?.mana_cost;
  const isTriggered = entry.kind.type === "TriggeredAbility";
  // CR 400.7 + CR 704.5d: the card identity an `AllCopies` yield matches on.
  // Prefer the engine-stamped `source_card_id` (set on triggered abilities so it
  // survives the source ceasing — a token that left the battlefield is gone from
  // `objects`), falling back to the live object for entries that carry no stamp.
  const yieldCardId =
    (entry.kind.type === "TriggeredAbility" ? entry.kind.data.ability.source_card_id : undefined) ??
    sourceObj?.card_id;
  // CR 117.3d: a stored yield the viewer already holds for this entry, so the
  // menu can surface a Revoke that echoes the exact engine-owned YieldTarget
  // (the frontend never constructs an incarnation or card_id itself).
  // The per-trigger `description` this entry carries — the G5 discriminator.
  const entryDescription =
    entry.kind.type === "TriggeredAbility" ? entry.kind.data.description ?? undefined : undefined;
  const matchingYield = priorityYields?.find((y) => {
    // Mirror the engine's None-wildcard rule (game_state.rs `is_priority_yielded`):
    // an absent/null `trigger_description` matches ANY entry description (coarse/
    // legacy yields), while a value matches only that exact trigger. A strict-only
    // compare would wrongly hide the Revoke pill for legacy yields still held.
    const stored = "ThisObject" in y.target ? y.target.ThisObject : y.target.AllCopies;
    const descMatches =
      stored.trigger_description == null || stored.trigger_description === entryDescription;
    return "ThisObject" in y.target
      ? y.target.ThisObject.source_id === entry.source_id && descMatches
      : yieldCardId !== undefined && y.target.AllCopies.card_id === yieldCardId && descMatches;
  });
  // Triggered abilities show "Triggered — From <source>" so the player can
  // tell which permanent owns the trigger without hovering the card image.
  // Activated abilities don't carry a pre-resolved source name (different
  // engine path); they keep the bare "Activated" label.
  const abilityLabel = details?.kind_label ?? (isSpell
    ? sourceName
    : entry.kind.type === "ActivatedAbility"
      ? t("stack.activated")
      : isTriggered && triggerSourceName
        ? t("stack.triggeredFrom", { source: triggerSourceName })
        : t("stack.triggered"));
  const triggerDescription =
    details?.ability_description
      ? renderDescription(details.ability_description, sourceName)
      : entry.kind.type === "TriggeredAbility"
        ? entry.kind.data.description && renderDescription(entry.kind.data.description, sourceName)
        : undefined;
  const targetLabels = details?.targets?.map((target) => target.label) ?? [];
  const selectedModeLabels = isSpell ? details?.selected_mode_labels ?? [] : [];
  const paidLabels =
    details?.paid?.map((fact) => formatPaidFact(fact, t)) ?? [];
  const contextLabels = [
    ...(details?.trigger_context?.map((context) => context.label) ?? []),
    ...(details?.provenance?.type === "Storm"
      ? [t("storm.copies", { count: details.provenance.data.copy_count })]
      : []),
  ];

  // Targeting: whether the engine is currently asking THIS seat to choose an
  // object and this stack entry is one of the choices. `getWaitingForObjectChoiceIds`
  // is the single WaitingFor -> choosable-ObjectId authority the battlefield,
  // zones, and attachment dialogs already read; the stack reads it too, so every
  // variant whose engine-authored legal set can name a stack object lights up
  // here without a per-variant branch — CR 115.7 retargets (Bolt Bend onto a
  // counterspell), CR 707.10c "may choose new targets for the copy", and plain
  // CR 601.2c target announcement alike.
  const isValidTarget =
    canActForWaitingState && getWaitingForObjectChoiceIds(waitingFor).includes(choiceObjectId);

  // Ring style: targeting glow overrides default ring
  const ringClass = isValidTarget
    ? "ring-4 ring-cyan-300 shadow-[0_0_18px_5px_rgba(103,232,249,0.85)]"
    : "ring-1 ring-white/10";

  const handleClick = () => {
    if (longPressFired.current) { longPressFired.current = false; return; }
    if (isValidTarget) {
      dispatchAction({ type: "ChooseTarget", data: { target: { Object: choiceObjectId } } });
    } else {
      inspectObject(entry.source_id);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 30, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, scale: 0.9 }}
      transition={{
        delay: index * 0.03 * pacingMultiplier,
        duration: pacingMultiplier === 0 ? 0 : undefined,
      }}
      style={style}
      data-stack-entry={entry.id}
      data-stack-top={isTop ? "true" : undefined}
      data-stack-pending={isPending ? "true" : undefined}
      data-object-id={isSpell ? entry.source_id : undefined}
      data-card-hover
      className={`relative cursor-pointer ${isCardInFlight ? "invisible" : ""}`}
      onClick={handleClick}
      onMouseEnter={isMobile ? undefined : () => {
        inspectObject(entry.source_id);
        onHoverChange?.(true);
      }}
      onMouseLeave={isMobile ? undefined : () => {
        inspectObject(null);
        onHoverChange?.(false);
      }}
      {...longPressHandlers}
    >
      {/* The settled card is the same composed surface used by its cast flight.
          Engine-authored stack details remain available through the native
          title and inspection interaction without repainting the card as a
          second dashboard. */}
      <div
        style={{ width: cardSize.width, height: cardSize.height }}
        className={`overflow-hidden rounded-lg shadow-lg ${ringClass}`}
        title={stackEntryTitle(abilityLabel, triggerDescription, targetLabels, paidLabels, contextLabels, t)}
      >
        {sourceObj ? (
          <ArenaStackCardSurface
            objectId={entry.source_id}
            displayCost={displayManaCost}
          />
        ) : isLoading ? (
          <div
            className="animate-pulse rounded-lg bg-gray-700 border border-gray-600"
            style={{ width: cardSize.width, height: cardSize.height }}
          />
        ) : !src || artError ? (
          // Issue #6156 on the stack: this path is explicitly token-aware
          // (`sourceIsToken` / `sourceTokenImageRef` above), so an artless
          // token's triggered or activated ability landed here and pulsed
          // forever — worse than a blank square, since it implies the art is
          // still coming. Name the source instead.
          <CardArtFallback
            name={sourceName}
            className="h-full w-full rounded-lg border border-gray-600"
          />
        ) : (
          <img
            src={src}
            alt={sourceName}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setArtError(true)}
          />
        )}
      </div>
      {isSpell && displayManaCost && (
        <div className="sr-only">
          <ManaCostPips cost={displayManaCost} size="fluid" />
        </div>
      )}

      {/* Badge: ×N coalesce count for engine-grouped mass triggers. */}
      {groupCount > 1 && (
        <span className="absolute -left-2 -top-2 rounded-full bg-purple-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-md">
          ×{groupCount}
        </span>
      )}

      {selectedModeLabels.length > 0 && (
        <section
          aria-label={t("stack.selectedModes")}
          className="sr-only"
        >
          <span>{t("stack.selectedModes")}</span>
          <ul>
            {selectedModeLabels.map((label, index) => (
              <li key={`${index}-${label}`}>{renderDescription(label, sourceName)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* CR 117.3d: discoverable auto-pass (yield) control on triggered abilities.
          A quiet icon-button (hover-expands to its label; amber when a yield
          stands) is the trigger; the options menu renders through
          PopoverMenu — portaled to <body>, so it escapes the stack panel's
          clipping/transform context, paints above the target-arc overlay, and
          dismisses on outside-click/Escape (the bespoke in-card menu did none of
          these). Each option dispatches SetPriorityYield; the frontend only names
          the source + scope (Add) or echoes a stored YieldTarget (Remove). */}
      {isTriggered && (
        <PopoverMenu
          ariaLabel={matchingYield ? t("priorityYield.menuButtonActive") : t("priorityYield.menuButton")}
          menuWidthPx={248}
          onOpenChange={(menuOpen) => {
            // Drop any hover/sticky card preview when the menu opens so it isn't
            // left lingering on screen while the player reads the options.
            if (menuOpen) {
              inspectObject(null);
              setPreviewSticky(false);
              onHoverChange?.(false);
            }
          }}
          renderTrigger={({ ref, open, toggle }) => {
            // A yield already standing is meaningful *state*, so the active chip
            // is loud (amber) and always shows its label. An available-but-unused
            // control is tertiary chrome: a quiet icon that only unfurls its
            // "Auto-pass" label on hover/focus (progressive disclosure), so it
            // never out-shouts the card at rest.
            const active = matchingYield != null;
            return (
              <button
                ref={ref}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={active ? t("priorityYield.menuButtonActive") : t("priorityYield.menuButton")}
                aria-pressed={active}
                title={active ? t("priorityYield.menuButtonActive") : t("priorityYield.menuButton")}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggle}
                className={`group absolute right-1 top-1/2 z-30 flex -translate-y-1/2 items-center rounded-full p-2 shadow-md ring-1 backdrop-blur-sm transition-colors ${
                  active
                    ? "bg-amber-500/95 text-black ring-amber-300"
                    : open
                      ? "bg-black/70 text-white ring-white/40"
                      : "bg-black/45 text-white/85 ring-white/25 hover:bg-black/70 hover:text-white hover:ring-white/40"
                }`}
              >
                <YieldMuteIcon muted={active} />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[10px] font-semibold leading-none transition-all duration-150 ${
                    active
                      ? "ml-1 max-w-[6rem] opacity-100"
                      : "ml-0 max-w-0 opacity-0 group-hover:ml-1 group-hover:max-w-[6rem] group-hover:opacity-100 group-focus-visible:ml-1 group-focus-visible:max-w-[6rem] group-focus-visible:opacity-100"
                  }`}
                >
                  {active ? t("priorityYield.menuButtonShortActive") : t("priorityYield.menuButtonShort")}
                </span>
              </button>
            );
          }}
        >
          {(close) => (
            <>
              {/* Explanatory header — the "full context" of what this control does,
                  so the scope options below read as a refinement, not a mystery. */}
              <div className="px-3 pb-2 pt-1.5">
                <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <YieldMuteIcon muted={false} />
                  {t("priorityYield.menuHeader")}
                </div>
                <p className="mt-1 text-xs font-normal leading-snug text-gray-400">
                  {t("priorityYield.menuExplainer")}
                </p>
              </div>
              <div className="mx-2 mb-1 border-t border-white/10" />
              <button
                role="menuitem"
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                onClick={() => {
                  dispatchAction({
                    type: "SetPriorityYield",
                    data: { op: { type: "Add", data: { source_id: entry.source_id, scope: "ThisObject" } } },
                  });
                  close();
                }}
              >
                <span className="text-sm font-semibold text-purple-200">{t("priorityYield.yieldThis")}</span>
                <span className="text-xs font-normal leading-tight text-gray-400">
                  {t("priorityYield.yieldThisHint", { source: sourceName })}
                </span>
              </button>
              <button
                role="menuitem"
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                onClick={() => {
                  dispatchAction({
                    type: "SetPriorityYield",
                    data: { op: { type: "Add", data: { source_id: entry.source_id, scope: "AllCopies" } } },
                  });
                  close();
                }}
              >
                <span className="text-sm font-semibold text-purple-200">{t("priorityYield.yieldAllCopies")}</span>
                <span className="text-xs font-normal leading-tight text-gray-400">
                  {t("priorityYield.allCopiesHint", { source: sourceName })}
                </span>
              </button>
              {matchingYield && (
                <button
                  role="menuitem"
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                  onClick={() => {
                    dispatchAction({
                      type: "SetPriorityYield",
                      data: { op: { type: "Remove", data: { target: matchingYield.target } } },
                    });
                    close();
                  }}
                >
                  <span className="text-sm font-semibold text-amber-200">{t("priorityYield.revoke")}</span>
                  <span className="text-xs font-normal leading-tight text-gray-400">
                    {t("priorityYield.revokeHint")}
                  </span>
                </button>
              )}
            </>
          )}
        </PopoverMenu>
      )}

    </motion.div>
  );
}

// Bell (will stop for this trigger) vs. bell-off (auto-passing / muted). An SVG
// glyph is theme-aware via `currentColor` and crisp at badge size, unlike an
// emoji whose rendering varies by platform. Paths adapted from Lucide (MIT).
function formatPaidFact(fact: StackPaidFactView, t: TFunction<"game">): string {
  switch (fact.type) {
    case "XValue":
      return t("stack.paidXValue", { value: fact.data.value });
    case "ManaSpent":
      return t("stack.paidManaSpent", { amount: fact.data.amount });
    case "ColorsSpent":
      return t("stack.paidColorsSpent", { count: fact.data.distinct });
    case "Kicked":
      return fact.data.count > 1 ? t("stack.paidKickedTimes", { count: fact.data.count }) : t("stack.paidKicked");
    case "AdditionalCostPaid":
      return t("stack.paidAdditionalCost");
    case "CastVariant":
      return fact.data.variant;
    case "Convoked":
      return t("stack.paidConvoked", { count: fact.data.count });
    default:
      return "";
  }
}

function stackEntryTitle(
  label: string,
  description: string | undefined,
  targets: string[],
  paid: string[],
  context: string[],
  t: TFunction<"game">,
): string {
  return [
    description ? `${label}: ${description}` : label,
    targets.length > 0 ? t("stack.titleTargets", { targets: targets.join(", ") }) : "",
    paid.length > 0 ? t("stack.titlePaid", { paid: paid.join(", ") }) : "",
    context.length > 0 ? t("stack.titleContext", { context: context.join(", ") }) : "",
  ].filter(Boolean).join("\n");
}
