import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { ArenaCardPresentation } from "./arenaCardPresentation.ts";
import { arenaCardRevision, buildArenaCardPresentation } from "./arenaCardPresentation.ts";
import { arenaComposableArtSource } from "./arenaArtSource.ts";
import { configureArenaReadableTexture } from "./arenaTexture.ts";
import {
  ARENA_CARD_HEIGHT as FULL_CARD_TEXTURE_HEIGHT,
  ARENA_CARD_WIDTH as FULL_CARD_TEXTURE_WIDTH,
  arenaCardStatColors,
  arenaCardStatText,
  arenaStatSegments,
  drawArenaBattlefieldTitle,
  renderArenaCardCanvas,
  renderArenaStatBadgeCanvas,
} from "./arenaCardCanvas.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { useEngineCardData } from "../../hooks/useEngineCardData.ts";
import { cardImageLookup, tokenFiltersForObject } from "../../services/cardImageLookup.ts";
import { CARD_BACK_URL } from "../../services/scryfall.ts";
import { useGameStore } from "../../stores/gameStore.ts";

const TEXTURE_WIDTH = 504;
const TEXTURE_HEIGHT = 700;
const TEXTURE_DISPOSE_DELAY_MS = 30_000;

interface TextureCacheEntry {
  promise: Promise<THREE.CanvasTexture>;
  refs: number;
  texture: THREE.CanvasTexture | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}

const textureCache = new Map<string, TextureCacheEntry>();

export interface ArenaCardTextures {
  battlefield: THREE.CanvasTexture | null;
  fullCard: THREE.CanvasTexture | null;
  statBadge: THREE.CanvasTexture | null;
}

type ArenaCardTextureVariant = "battlefield" | "full-card" | "stat-badge";

export function useArenaCardTextures(
  objectId: number,
  includeFullCard = false,
): ArenaCardTextures {
  const maxAnisotropy = useThree(({ gl }) =>
    gl.capabilities.getMaxAnisotropy()
  );
  const object = useGameStore((state) => state.gameState?.objects[objectId]);
  const attribution = useGameStore((state) => state.gameState?.attribution?.[String(objectId)]);
  const faceData = useEngineCardData(object?.face_down ? null : object?.name ?? null);
  const lookup = object ? cardImageLookup(object) : null;
  const tokenFilters = useMemo(
    () => (object ? tokenFiltersForObject(object) : undefined),
    [object],
  );
  const { src } = useCardImage(lookup?.name ?? "", {
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
            object.mana_cost,
            attribution,
            faceData?.oracle_text ?? null,
          )
        : null,
    [attribution, faceData?.oracle_text, object],
  );
  const rawArtSource = presentation?.faceDown ? CARD_BACK_URL : src;
  const artSource = rawArtSource
    ? arenaComposableArtSource(rawArtSource)
    : null;
  const revision =
    presentation && artSource
      ? `${arenaCardRevision(presentation)}|${artSource}`
      : null;
  const battlefield = useCachedArenaCardTexture(
    revision && !includeFullCard
      ? `${revision}|battlefield`
      : null,
    presentation,
    artSource,
    "battlefield",
    maxAnisotropy,
  );
  const fullCard = useCachedArenaCardTexture(
    revision && includeFullCard
      ? `${revision}|full-card`
      : null,
    presentation,
    artSource,
    "full-card",
    maxAnisotropy,
  );
  const statText = presentation ? arenaCardStatText(presentation) : null;
  const statBadge = useCachedArenaCardTexture(
    revision && presentation && statText
      ? `stat-badge:${statText}:${presentation.powerColor}:${presentation.toughnessColor}`
      : null,
    presentation,
    artSource,
    "stat-badge",
    maxAnisotropy,
  );

  return { battlefield, fullCard, statBadge };
}

function useCachedArenaCardTexture(
  key: string | null,
  presentation: ArenaCardPresentation | null,
  artSource: string | null,
  variant: ArenaCardTextureVariant,
  maxAnisotropy: number,
): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (!key || !presentation || !artSource) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    const entry = acquireTexture(
      key,
      presentation,
      artSource,
      variant,
      maxAnisotropy,
    );
    entry.promise.then((nextTexture) => {
      if (!cancelled) setTexture(nextTexture);
    }).catch(() => {
      if (!cancelled) setTexture(null);
    });

    return () => {
      cancelled = true;
      releaseTexture(key);
    };
  }, [artSource, key, maxAnisotropy, presentation, variant]);

  return texture;
}

function acquireTexture(
  key: string,
  presentation: ArenaCardPresentation,
  artSource: string,
  variant: ArenaCardTextureVariant,
  maxAnisotropy: number,
): TextureCacheEntry {
  const cached = textureCache.get(key);
  if (cached) {
    cached.refs += 1;
    if (cached.disposeTimer) {
      clearTimeout(cached.disposeTimer);
      cached.disposeTimer = null;
    }
    void cached.promise.then((texture) => {
      configureArenaReadableTexture(texture, maxAnisotropy);
    }).catch(() => undefined);
    return cached;
  }

  const entry: TextureCacheEntry = {
    promise: Promise.resolve(null as unknown as THREE.CanvasTexture),
    refs: 1,
    texture: null,
    disposeTimer: null,
  };
  entry.promise = createArenaCardTexture(
    presentation,
    artSource,
    variant,
    maxAnisotropy,
  ).then(
    (texture) => {
      entry.texture = texture;
      return texture;
    },
  ).catch((error: unknown) => {
    if (textureCache.get(key) === entry) {
      textureCache.delete(key);
    }
    throw error;
  });
  textureCache.set(key, entry);
  return entry;
}

function releaseTexture(key: string): void {
  const entry = textureCache.get(key);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0 || entry.disposeTimer) return;
  entry.disposeTimer = setTimeout(() => {
    if (entry.refs > 0) return;
    entry.texture?.dispose();
    textureCache.delete(key);
  }, TEXTURE_DISPOSE_DELAY_MS);
}

async function createArenaCardTexture(
  presentation: ArenaCardPresentation,
  artSource: string,
  variant: ArenaCardTextureVariant,
  maxAnisotropy: number,
): Promise<THREE.CanvasTexture> {
  const canvas = variant === "full-card"
    ? await renderArenaFullCardCanvas(presentation, artSource)
    : variant === "battlefield"
      ? await renderArenaBattlefieldCardCanvas(
          presentation,
          artSource,
        )
      : await renderArenaStatBadgeCanvas(
          arenaCardStatText(presentation) ?? "",
          arenaCardStatColors(presentation),
        );
  const texture = new THREE.CanvasTexture(canvas);
  configureArenaReadableTexture(texture, maxAnisotropy);
  return texture;
}

async function renderArenaFullCardCanvas(
  presentation: ArenaCardPresentation,
  artSource: string,
): Promise<HTMLCanvasElement> {
  // This is the same canvas pipeline ArenaCardFace uses in hand. Keep its
  // crown, title treatment, and art placement intact; battlefield compaction
  // is performed later by geometry and UV cropping in ArenaPermanent.
  const canvas = await renderArenaCardCanvas(presentation, artSource);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  drawArenaBattlefieldTitle(
    context,
    presentation.name,
    presentation.manaSymbols.length,
  );

  const badgeY = FULL_CARD_TEXTURE_HEIGHT * 0.16;
  const badgeScale = 1.8;
  if (presentation.counters.length > 0) {
    const count = presentation.counters.reduce(
      (sum, counter) => sum + counter.count,
      0,
    );
    drawRoundBadge(
      context,
      String(count),
      FULL_CARD_TEXTURE_WIDTH * 0.12,
      badgeY,
      "#15251c",
      "#9cf7bd",
      badgeScale,
    );
  }
  return canvas;
}

async function renderArenaBattlefieldCardCanvas(
  presentation: ArenaCardPresentation,
  artSource: string,
): Promise<HTMLCanvasElement> {
  const art = await loadImage(artSource);
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.save();
  context.beginPath();
  context.roundRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT, 22);
  context.clip();

  // Battlefield cards use a neutral black silhouette so the frame remains
  // legible over every tabletop and never inherits a muddy color from the art.
  context.fillStyle = "#050606";
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  const artX = 14;
  const artY = 58;
  const artW = TEXTURE_WIDTH - 28;
  const artH = TEXTURE_HEIGHT - artY - 14;
  drawCover(context, art, artX, artY, artW, artH);

  const artShade = context.createLinearGradient(0, artY, 0, artY + artH);
  artShade.addColorStop(0, "rgba(2, 5, 8, 0.02)");
  artShade.addColorStop(0.62, "rgba(2, 5, 8, 0.08)");
  artShade.addColorStop(1, "rgba(2, 5, 8, 0.78)");
  context.fillStyle = artShade;
  context.fillRect(artX, artY, artW, artH);

  context.fillStyle = "rgba(8, 10, 10, 0.9)";
  context.fillRect(0, 0, TEXTURE_WIDTH, 54);

  if (presentation.modifierCount > 0) {
    context.fillStyle = "#76f3a1";
    context.shadowColor = "#43ef86";
    context.shadowBlur = 16;
    context.fillRect(0, 60, 6, artH - 8);
    context.shadowBlur = 0;
  }

  context.fillStyle = "#fff8e7";
  context.font = '600 25px "Newsreader", Georgia, serif';
  context.textBaseline = "middle";
  drawFittedText(context, presentation.name, 18, 28, 286);

  drawManaSymbols(context, presentation.manaSymbols, TEXTURE_WIDTH - 16, 27);

  const statText = arenaCardStatText(presentation);
  if (statText) {
    drawStatBadge(
      context,
      statText,
      TEXTURE_WIDTH - 18,
      TEXTURE_HEIGHT - 27,
      arenaCardStatColors(presentation),
    );
  }

  if (presentation.counters.length > 0) {
    const count = presentation.counters.reduce((sum, counter) => sum + counter.count, 0);
    drawRoundBadge(context, String(count), 27, 78, "#15251c", "#9cf7bd");
  }
  context.restore();
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load card art: ${src}`));
    image.src = src;
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  context.fillText(text, x, y, maxWidth);
}

function drawManaSymbols(
  context: CanvasRenderingContext2D,
  symbols: string[],
  right: number,
  centerY: number,
): void {
  const diameter = 31;
  const gap = 5;
  symbols.slice(0, 6).reverse().forEach((symbol, index) => {
    const x = right - diameter - index * (diameter + gap);
    context.beginPath();
    context.arc(x + diameter / 2, centerY, diameter / 2, 0, Math.PI * 2);
    context.fillStyle = manaSymbolColor(symbol);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.38)";
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = "#111410";
    context.font = '800 17px "JetBrains Mono", monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(symbol, x + diameter / 2, centerY + 1, diameter - 3);
  });
  context.textAlign = "left";
}

function drawStatBadge(
  context: CanvasRenderingContext2D,
  text: string,
  right: number,
  centerY: number,
  colors: ReturnType<typeof arenaCardStatColors>,
): void {
  context.font = '800 26px "Newsreader", Georgia, serif';
  const width = Math.max(66, context.measureText(text).width + 30);
  context.fillStyle = "#d9d1b9";
  context.strokeStyle = "rgba(255,255,255,0.5)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(right - width, centerY - 20, width, 40, 16);
  context.fill();
  context.stroke();
  context.textAlign = "left";
  context.textBaseline = "middle";
  let cursorX = right - width / 2 - context.measureText(text).width / 2;
  arenaStatSegments(text, colors).forEach((segment) => {
    context.fillStyle = segment.ink;
    context.fillText(segment.text, cursorX, centerY + 1);
    cursorX += context.measureText(segment.text).width;
  });
  context.textAlign = "left";
}

function drawRoundBadge(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  fill: string,
  stroke: string,
  scale = 1,
): void {
  const radius = 23 * scale;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 2 * scale;
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `800 ${18 * scale}px "JetBrains Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, centerX, centerY + scale);
  context.textAlign = "left";
}

function manaSymbolColor(symbol: string): string {
  if (symbol.includes("W")) return "#f5e9bf";
  if (symbol.includes("U")) return "#8dcced";
  if (symbol.includes("B")) return "#a69aa8";
  if (symbol.includes("R")) return "#e88869";
  if (symbol.includes("G")) return "#8bcaa0";
  return "#d2cdc0";
}
