import { useMemo } from "react";

import type { ManaCost, ObjectId } from "../../adapter/types.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { useEngineCardData } from "../../hooks/useEngineCardData.ts";
import { cardImageLookup, tokenFiltersForObject } from "../../services/cardImageLookup.ts";
import { CARD_BACK_URL } from "../../services/scryfall.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { formatCounterType } from "../../viewmodel/cardProps.ts";
import { ManaCostPips } from "../mana/ManaCostPips.tsx";
import { UnimplementedMechanicsBadge } from "../card/UnimplementedMechanicsBadge.tsx";
import { buildArenaCardPresentation } from "./arenaCardPresentation.ts";

interface ArenaCardFaceProps {
  objectId: ObjectId;
  displayCost?: ManaCost;
  isCostReduced?: boolean;
  mode?: "hand" | "inspection";
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

  const presentation = useMemo(
    () =>
      object
        ? buildArenaCardPresentation(
            object,
            displayCost ?? object.mana_cost,
            attribution,
            faceData?.oracle_text ?? null,
          )
        : null,
    [attribution, displayCost, faceData?.oracle_text, object],
  );

  if (!object || !presentation) return null;

  const artSrc = presentation.faceDown ? CARD_BACK_URL : src;
  const frameStyle = arenaFrameStyle(presentation.colors);
  const effectiveToughness =
    presentation.toughness == null
      ? null
      : presentation.toughness - presentation.damageMarked;
  const inspection = mode === "inspection";

  return (
    <article
      className={`arena-card-face @container relative isolate h-[var(--hand-card-h)] w-[var(--hand-card-w)] overflow-hidden rounded-[7.4%/5.3%] bg-[#11130f] text-[#f7f0dc] shadow-[0_12px_28px_rgba(0,0,0,0.55)] ring-1 ring-white/15 ${className}`}
      style={{ ...frameStyle, ...style }}
      aria-label={presentation.name}
      data-arena-live-card
      data-arena-live-card-mode={mode}
      data-arena-modifier-count={presentation.modifierCount}
    >
      <div className="absolute inset-[2.4%] rounded-[5.6%/4%] bg-[var(--arena-frame)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),inset_0_0_18px_rgba(0,0,0,0.7)]" />

      <div className="absolute left-[5.8%] right-[5.8%] top-[4.4%] z-10 flex h-[8.8%] items-center rounded-[12%/50%] border border-white/15 bg-[linear-gradient(90deg,rgba(8,10,9,0.84),rgba(27,28,24,0.72))] px-[4.2%] shadow-[0_2px_5px_rgba(0,0,0,0.7)]">
        <span
          className={`truncate font-[Newsreader] font-semibold leading-none tracking-[-0.02em] text-[#fff8e7] ${
            inspection
              ? "text-[clamp(12px,5.2cqi,22px)]"
              : "text-[clamp(7px,7.1cqi,15px)]"
          }`}
        >
          {presentation.name}
        </span>
      </div>

      <div className="absolute inset-0 z-20 @container">
        <ManaCostPips
          cost={displayCost ?? object.mana_cost}
          isReduced={isCostReduced}
          size="fluid"
        />
      </div>

      <div className="absolute left-[5.8%] right-[5.8%] top-[14.5%] h-[43.5%] overflow-hidden rounded-[2.5%] bg-black/50 ring-1 ring-black/80">
        {artSrc ? (
          <img
            src={artSrc}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`h-full w-full bg-[linear-gradient(115deg,#161a1c_20%,#2e3332_45%,#151918_70%)] bg-[length:220%_100%] ${isLoading ? "animate-pulse" : ""}`}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_65%,rgba(0,0,0,0.32))]" />
      </div>

      <div className="absolute left-[5.8%] right-[5.8%] top-[59.4%] z-10 flex h-[6.8%] items-center rounded-[10%/45%] border border-white/10 bg-[linear-gradient(90deg,rgba(12,13,12,0.88),rgba(40,39,32,0.78))] px-[3.5%]">
        <span
          className={`truncate font-[Newsreader] font-semibold leading-none text-[#e9e0cb] ${
            inspection
              ? "text-[clamp(8px,3.2cqi,13px)]"
              : "text-[clamp(5px,4.2cqi,9px)]"
          }`}
        >
          {presentation.typeLine}
        </span>
      </div>

      <div className="absolute bottom-[6.2%] left-[5.8%] right-[5.8%] top-[67.4%] overflow-hidden rounded-[3.5%] border border-black/50 bg-[linear-gradient(145deg,rgba(242,234,211,0.97),rgba(207,199,174,0.96))] px-[4%] py-[3.2%] text-[#171713] shadow-[inset_0_0_10px_rgba(72,57,27,0.2)]">
        {presentation.rulesText && (
          <p
            className={`whitespace-pre-line font-[Newsreader] font-medium ${
              inspection
                ? "line-clamp-8 text-[clamp(8px,3.4cqi,14px)] leading-[1.12]"
                : "line-clamp-5 text-[clamp(4.5px,3.8cqi,8px)] leading-[1.05]"
            }`}
          >
            {presentation.rulesText}
          </p>
        )}
        {presentation.keywords.length > 0 && (
          <div className="absolute bottom-[3%] left-[3%] right-[3%] flex gap-[2%] overflow-hidden">
            {presentation.keywords.slice(0, 3).map((keyword) => (
              <span
                key={keyword}
                className={`truncate rounded-full bg-black/78 px-[3%] py-[1.5%] font-[Newsreader] font-semibold leading-none text-[#f4ead0] ${
                  inspection
                    ? "text-[clamp(7px,2.7cqi,11px)]"
                    : "text-[clamp(4px,3.1cqi,7px)]"
                }`}
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
      </div>

      {presentation.modifierCount > 0 && (
        <span
          className="absolute left-[3.2%] top-[28%] z-30 h-[34%] w-[2.1%] rounded-full bg-[#80ffb0] shadow-[0_0_8px_2px_rgba(75,255,147,0.9)]"
          aria-hidden
        />
      )}

      {presentation.counters.length > 0 && (
        <div className="absolute bottom-[3.2%] left-[4.5%] z-30 flex gap-1">
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

      {presentation.power != null && effectiveToughness != null && (
        <span
          className={`absolute bottom-[2.8%] right-[3.8%] z-30 rounded-[28%/36%] border border-white/25 bg-[linear-gradient(145deg,#e8dfc5,#8f886f)] px-[5%] py-[1.8%] font-[Newsreader] font-black leading-none text-[#10110e] shadow-[0_2px_5px_rgba(0,0,0,0.75)] ${
            inspection
              ? "text-[clamp(11px,5cqi,20px)]"
              : "text-[clamp(7px,6cqi,13px)]"
          }`}
        >
          {presentation.power}/{effectiveToughness}
        </span>
      )}

      {presentation.loyalty != null && (
        <span className="absolute bottom-[2.8%] right-[3.8%] z-30 rounded-full bg-[#151a22] px-[5%] py-[2%] font-[Newsreader] text-[clamp(7px,6cqi,13px)] font-black leading-none text-white ring-1 ring-white/50">
          {presentation.loyalty}
        </span>
      )}

      <UnimplementedMechanicsBadge
        mechanics={object.unimplemented_mechanics}
        variant="overlay"
      />
    </article>
  );
}

function arenaFrameStyle(colors: string[]): React.CSSProperties {
  const stops = colors.length > 0
    ? colors.map((color) => FRAME_COLORS[color] ?? FRAME_COLORS.Colorless)
    : [FRAME_COLORS.Colorless];
  const gradient =
    stops.length === 1
      ? `linear-gradient(145deg, ${stops[0]}, #161815 72%)`
      : `linear-gradient(110deg, ${stops.join(", ")})`;
  return { "--arena-frame": gradient } as React.CSSProperties;
}

const FRAME_COLORS: Record<string, string> = {
  White: "#7f755f",
  Blue: "#315d76",
  Black: "#4d444d",
  Red: "#7e4132",
  Green: "#35604a",
  Colorless: "#555852",
};
