import { useMemo } from "react";

import type { ManaCost, ObjectId } from "../../adapter/types.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { useEngineCardData } from "../../hooks/useEngineCardData.ts";
import { cardImageLookup, tokenFiltersForObject } from "../../services/cardImageLookup.ts";
import { CARD_BACK_URL } from "../../services/scryfall.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { formatCounterType } from "../../viewmodel/cardProps.ts";
import { UnimplementedMechanicsBadge } from "../card/UnimplementedMechanicsBadge.tsx";
import { arenaComposableArtSource } from "./arenaArtSource.ts";
import { buildArenaCardPresentation } from "./arenaCardPresentation.ts";
import { useArenaComposedCard } from "./useArenaComposedCard.ts";

interface ArenaCardFaceProps {
  objectId: ObjectId;
  displayCost?: ManaCost;
  isCostReduced?: boolean;
  mode?: "hand" | "inspection";
  as?: "article" | "div";
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A live card face composed from art plus engine characteristics. Unlike a
 * printing image, its title, cost, types, stats, counters, and modifier signal
 * all update with the current GameObject.
 */
export function ArenaCardFace({
  objectId,
  displayCost,
  isCostReduced = false,
  mode = "hand",
  as: Element = "article",
  className = "",
  style,
}: ArenaCardFaceProps) {
  const object = useGameStore((state) => state.gameState?.objects[objectId]);
  const attribution = useGameStore((state) => state.gameState?.attribution?.[String(objectId)]);
  const faceData = useEngineCardData(object?.face_down ? null : object?.name ?? null);
  const lookup = object ? cardImageLookup(object) : null;
  const tokenFilters = useMemo(
    () => (object ? tokenFiltersForObject(object) : undefined),
    [object],
  );
  const { src, isLoading } = useCardImage(lookup?.name ?? "", {
    size: "art_crop",
    faceIndex: lookup?.faceIndex,
    isToken: object?.display_source === "Token",
    tokenFilters,
    tokenImageRef: object?.token_image_ref,
    oracleId: lookup?.oracleId,
    faceName: lookup?.faceName,
  });

  const presentation = useMemo(() => {
    if (!object) return null;
    const next = buildArenaCardPresentation(
      object,
      displayCost ?? object.mana_cost,
      attribution,
      faceData?.oracle_text ?? null,
      isCostReduced,
    );
    return next;
  }, [
    attribution,
    displayCost,
    faceData?.oracle_text,
    isCostReduced,
    object,
  ]);

  const rawArtSrc = presentation
    ? presentation.faceDown
      ? CARD_BACK_URL
      : src
    : null;
  const artSrc = rawArtSrc ? arenaComposableArtSource(rawArtSrc) : null;
  const composedCard = useArenaComposedCard(presentation, artSrc);

  if (!object || !presentation) return null;

  return (
    <Element
      className={`arena-card-face relative isolate h-[var(--hand-card-h)] w-[var(--hand-card-w)] overflow-hidden rounded-[4.4%/3.15%] bg-[#0b0b0b] text-[#f7f0dc] shadow-[0_12px_28px_rgba(0,0,0,0.55)] ${className}`}
      style={style}
      aria-label={presentation.name}
      data-arena-live-card
      data-arena-live-card-mode={mode}
      data-arena-modifier-count={presentation.modifierCount}
      data-arena-art-source={artSrc ?? undefined}
      data-arena-power={presentation.power ?? undefined}
      data-arena-toughness={
        presentation.toughness == null
          ? undefined
          : presentation.toughness - presentation.damageMarked
      }
    >
      {composedCard ? (
        <img
          src={composedCard}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-fill"
        />
      ) : (
        <div
          className={`absolute inset-0 bg-[linear-gradient(115deg,#11151a_20%,#2c343a_45%,#11151a_70%)] bg-[length:220%_100%] ${isLoading || artSrc ? "animate-pulse" : ""}`}
        />
      )}

      {presentation.modifierCount > 0 && (
        <span
          className="absolute left-[1.5%] top-[15%] z-30 h-[42%] w-[1.5%] rounded-full bg-[#80ffb0] shadow-[0_0_8px_2px_rgba(75,255,147,0.9)]"
          aria-hidden
        />
      )}

      {presentation.counters.length > 0 && (
        <div className="absolute bottom-[2.8%] left-[4.5%] z-30 flex gap-1">
          {presentation.counters.slice(0, 2).map((counter) => (
            <span
              key={counter.type}
              className="rounded-full bg-[#101310]/90 px-[4px] py-[2px] font-mono text-[clamp(5px,3.6cqi,8px)] font-bold leading-none text-white ring-1 ring-[#b9f7bd]/50"
              title={formatCounterType(counter.type)}
            >
              {counter.count}
            </span>
          ))}
        </div>
      )}

      <UnimplementedMechanicsBadge
        mechanics={object.unimplemented_mechanics}
        variant="overlay"
      />
    </Element>
  );
}
