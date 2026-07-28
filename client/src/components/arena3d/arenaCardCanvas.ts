import type { ArenaCardPresentation } from "./arenaCardPresentation.ts";

export const ARENA_CARD_WIDTH = 1005;
export const ARENA_CARD_HEIGHT = 1407;

const CORNER_RADIUS = 44;
const RULES_SIZES = [50, 47, 44, 41, 38, 35, 32, 29];
const GEOMETRY = {
  art: { x: 0.078, y: 0.114, width: 0.844, height: 0.437 },
  titleY: 0.076,
  typeY: 0.594,
  textLeft: 0.088,
  textRight: 0.915,
  rulesTop: 0.632,
  rulesBottom: 0.875,
  stats: { x: 0.762, y: 0.888, width: 0.198, height: 0.072 },
  statsTextCenter: { x: 0.548, y: 0.447 },
} as const;

type FrameLetter = "W" | "U" | "B" | "R" | "G" | "M" | "A" | "V" | "L";

interface RichLine {
  tokens: RichToken[];
  width: number;
  gapBefore: number;
}

type RichToken =
  | { kind: "text"; text: string; width: number; attachPrevious: boolean }
  | { kind: "pip"; symbol: string; width: number; attachPrevious: boolean };

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let fontsReady: Promise<void> | null = null;

export function arenaFrameLetter(
  presentation: Pick<ArenaCardPresentation, "colors" | "typeLine">,
): FrameLetter {
  if (presentation.typeLine.includes("Land")) return "L";
  if (presentation.colors.length === 0) {
    return presentation.typeLine.includes("Artifact") ? "A" : "V";
  }
  if (presentation.colors.length > 1) return "M";
  return COLOR_FRAME[presentation.colors[0]] ?? "V";
}

export async function ensureArenaCardFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    const beleren = new FontFace(
      "Arena Beleren",
      'url("/arena/fonts/beleren-b.ttf")',
    );
    const mplantin = new FontFace(
      "Arena MPlantin",
      'url("/arena/fonts/mplantin.ttf")',
    );
    const loaded = await Promise.all([beleren.load(), mplantin.load()]);
    loaded.forEach((font) => document.fonts.add(font));
  })();
  return fontsReady;
}

export async function renderArenaCardCanvas(
  presentation: ArenaCardPresentation,
  artSource: string,
): Promise<HTMLCanvasElement> {
  const frameLetter = arenaFrameLetter(presentation);
  const [frameImage, artImage] = await Promise.all([
    loadImage(frameUrl(frameLetter)),
    loadImage(artSource),
    ensureArenaCardFonts(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = ARENA_CARD_WIDTH;
  canvas.height = ARENA_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  context.beginPath();
  context.roundRect(
    0,
    0,
    ARENA_CARD_WIDTH,
    ARENA_CARD_HEIGHT,
    CORNER_RADIUS,
  );
  context.clip();
  context.fillStyle = "#0b0b0b";
  context.fillRect(0, 0, ARENA_CARD_WIDTH, ARENA_CARD_HEIGHT);

  const art = GEOMETRY.art;
  drawCover(
    context,
    artImage,
    art.x * ARENA_CARD_WIDTH,
    art.y * ARENA_CARD_HEIGHT,
    art.width * ARENA_CARD_WIDTH,
    art.height * ARENA_CARD_HEIGHT,
  );
  context.drawImage(frameImage, 0, 0, ARENA_CARD_WIDTH, ARENA_CARD_HEIGHT);

  const left = GEOMETRY.textLeft * ARENA_CARD_WIDTH;
  const right = GEOMETRY.textRight * ARENA_CARD_WIDTH;
  const ink = "#171310";
  const symbols = presentation.manaSymbols;
  const pipSize = 50;
  const pipGap = 6;
  const pipRowWidth =
    symbols.length > 0 ? symbols.length * (pipSize + pipGap) : 0;

  context.fillStyle = ink;
  context.font = '54px "Arena Beleren", "Times New Roman", serif';
  drawVerticallyCenteredText(
    context,
    presentation.name,
    left,
    GEOMETRY.titleY * ARENA_CARD_HEIGHT,
    right - left - (pipRowWidth > 0 ? pipRowWidth + 16 : 0),
  );

  if (symbols.length > 0) {
    const images = await Promise.all(
      symbols.map((symbol) => loadImage(pipUrl(symbol))),
    );
    let x = right - pipRowWidth + pipGap;
    const y = GEOMETRY.titleY * ARENA_CARD_HEIGHT - pipSize / 2;
    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.5)";
    context.shadowBlur = 6;
    context.shadowOffsetY = 4;
    images.forEach((image) => {
      if (presentation.manaCostReduced) {
        context.beginPath();
        context.arc(
          x + pipSize / 2,
          y + pipSize / 2,
          pipSize / 2 + 4,
          0,
          Math.PI * 2,
        );
        context.strokeStyle = "#53ef86";
        context.lineWidth = 6;
        context.shadowColor = "rgba(55, 255, 126, 0.8)";
        context.shadowBlur = 10;
        context.stroke();
        context.shadowColor = "rgba(0, 0, 0, 0.5)";
        context.shadowBlur = 6;
      }
      context.drawImage(image, x, y, pipSize, pipSize);
      x += pipSize + pipGap;
    });
    context.restore();
  }

  context.font = '46px "Arena Beleren", "Times New Roman", serif';
  drawVerticallyCenteredText(
    context,
    presentation.typeLine,
    left,
    GEOMETRY.typeY * ARENA_CARD_HEIGHT,
    right - left,
  );

  if (presentation.rulesText) {
    await drawRulesText(
      context,
      presentation.rulesText,
      left,
      right,
      ink,
    );
  }

  const effectiveToughness =
    presentation.toughness == null
      ? null
      : presentation.toughness - presentation.damageMarked;
  const statText =
    presentation.power != null && effectiveToughness != null
      ? `${presentation.power}/${effectiveToughness}`
      : presentation.loyalty == null
        ? null
        : String(presentation.loyalty);
  if (statText) {
    const statsImage = await loadImage(statsUrl(frameLetter));
    const stats = GEOMETRY.stats;
    context.drawImage(
      statsImage,
      stats.x * ARENA_CARD_WIDTH,
      stats.y * ARENA_CARD_HEIGHT,
      stats.width * ARENA_CARD_WIDTH,
      stats.height * ARENA_CARD_HEIGHT,
    );
    context.font = '48px "Arena Beleren", "Times New Roman", serif';
    context.textAlign = "center";
    drawVerticallyCenteredText(
      context,
      statText,
      (stats.x + stats.width * GEOMETRY.statsTextCenter.x)
        * ARENA_CARD_WIDTH,
      (stats.y + stats.height * GEOMETRY.statsTextCenter.y)
        * ARENA_CARD_HEIGHT,
      undefined,
      "4",
    );
    context.textAlign = "left";
  }

  return canvas;
}

async function drawRulesText(
  context: CanvasRenderingContext2D,
  rulesText: string,
  left: number,
  right: number,
  ink: string,
): Promise<void> {
  const boxTop = GEOMETRY.rulesTop * ARENA_CARD_HEIGHT;
  const boxHeight =
    (GEOMETRY.rulesBottom - GEOMETRY.rulesTop) * ARENA_CARD_HEIGHT;
  const maxWidth = right - left;
  const paragraphs = rulesText.split("\n");
  let fit: {
    fontSize: number;
    lineHeight: number;
    pipSize: number;
    spaceWidth: number;
    lines: RichLine[];
    totalHeight: number;
  } | null = null;

  for (const fontSize of RULES_SIZES) {
    context.font = `${fontSize}px "Arena MPlantin", Georgia, serif`;
    const lineHeight = Math.round(fontSize * 1.12);
    const inlinePipSize = Math.round(fontSize * 0.98);
    const spaceWidth = context.measureText(" ").width;
    const paragraphGap = Math.round(fontSize * 0.35);
    const lines = paragraphs.flatMap((paragraph, index) =>
      layoutParagraph(
        tokenizeArenaRulesParagraph(context, paragraph, inlinePipSize),
        maxWidth,
        spaceWidth,
        index > 0 ? paragraphGap : 0,
      ),
    );
    const totalHeight = lines.reduce(
      (height, line) => height + lineHeight + line.gapBefore,
      0,
    );
    fit = {
      fontSize,
      lineHeight,
      pipSize: inlinePipSize,
      spaceWidth,
      lines,
      totalHeight,
    };
    if (totalHeight <= boxHeight) break;
  }
  if (!fit) return;
  while (fit.totalHeight > boxHeight && fit.lines.length > 1) {
    const dropped = fit.lines.pop();
    if (dropped) {
      fit.totalHeight -= fit.lineHeight + dropped.gapBefore;
    }
  }

  const symbols = [
    ...new Set(
      fit.lines.flatMap((line) =>
        line.tokens.flatMap((token) =>
          token.kind === "pip" ? [token.symbol] : [],
        ),
      ),
    ),
  ];
  const pipImages = new Map(
    await Promise.all(
      symbols.map(async (symbol) => [symbol, await loadImage(pipUrl(symbol))] as const),
    ),
  );

  context.fillStyle = ink;
  context.font = `${fit.fontSize}px "Arena MPlantin", Georgia, serif`;
  context.textBaseline = "alphabetic";
  let y = boxTop + Math.max(0, (boxHeight - fit.totalHeight) / 2);
  for (const line of fit.lines) {
    y += line.gapBefore;
    const baseline = y + fit.fontSize * 0.82;
    let x = left;
    line.tokens.forEach((token, index) => {
      if (token.kind === "text") {
        context.fillText(token.text, x, baseline);
      } else {
        const image = pipImages.get(token.symbol);
        if (image) {
          context.drawImage(
            image,
            x,
            baseline - fit.pipSize * 0.9,
            fit.pipSize,
            fit.pipSize,
          );
        }
      }
      const next = line.tokens[index + 1];
      x += token.width + (next && !next.attachPrevious ? fit.spaceWidth : 0);
    });
    y += fit.lineHeight;
  }
}

export function tokenizeArenaRulesParagraph(
  context: Pick<CanvasRenderingContext2D, "measureText">,
  paragraph: string,
  pipSize: number,
): RichToken[] {
  const tokens: RichToken[] = [];
  const pipPattern = /\{([^}]+)\}/g;
  paragraph
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      let cursor = 0;
      let hasWordToken = false;
      for (const match of word.matchAll(pipPattern)) {
        const matchIndex = match.index;
        if (matchIndex > cursor) {
          const text = word.slice(cursor, matchIndex);
          tokens.push({
            kind: "text",
            text,
            width: context.measureText(text).width,
            attachPrevious: hasWordToken,
          });
          hasWordToken = true;
        }
        tokens.push({
          kind: "pip",
          symbol: match[1],
          width: pipSize,
          attachPrevious: hasWordToken,
        });
        hasWordToken = true;
        cursor = matchIndex + match[0].length;
      }
      if (cursor < word.length) {
        const text = word.slice(cursor);
        tokens.push({
          kind: "text",
          text,
          width: context.measureText(text).width,
          attachPrevious: hasWordToken,
        });
      }
    });
  return tokens;
}

function layoutParagraph(
  tokens: RichToken[],
  maxWidth: number,
  spaceWidth: number,
  gapBefore: number,
): RichLine[] {
  const lines: RichLine[] = [];
  let line: RichLine = { tokens: [], width: 0, gapBefore: 0 };
  tokens.forEach((token) => {
    const separator =
      line.tokens.length > 0 && !token.attachPrevious ? spaceWidth : 0;
    const nextWidth = line.width + separator + token.width;
    if (line.tokens.length > 0 && nextWidth > maxWidth) {
      lines.push(line);
      line = { tokens: [token], width: token.width, gapBefore: 0 };
    } else {
      line.tokens.push(token);
      line.width = nextWidth;
    }
  });
  if (line.tokens.length > 0) lines.push(line);
  if (lines[0]) lines[0].gapBefore = gapBefore;
  return lines;
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

function drawVerticallyCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  maxWidth?: number,
  reference = "Ag",
): void {
  const metrics = context.measureText(reference);
  const ascent = metrics.actualBoundingBoxAscent ?? 0;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  context.textBaseline = "alphabetic";
  context.fillText(text, x, centerY + (ascent - descent) / 2, maxWidth);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(source);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(source);
      reject(new Error(`Unable to load Arena card asset: ${source}`));
    };
    image.src = source;
  });
  imageCache.set(source, promise);
  return promise;
}

function frameUrl(letter: FrameLetter): string {
  return `/arena/frames/m15/m15Frame${letter}.png`;
}

function statsUrl(letter: FrameLetter): string {
  const statsLetter = letter === "L" ? "C" : letter;
  return `/arena/frames/m15/m15PT${statsLetter}.png`;
}

export function arenaPipUrl(symbol: string): string {
  return pipUrl(symbol);
}

function pipUrl(symbol: string): string {
  return `/arena/pips/${symbol.replace(/\//g, "")}.png`;
}

const COLOR_FRAME: Partial<
  Record<ArenaCardPresentation["colors"][number], FrameLetter>
> = {
  White: "W",
  Blue: "U",
  Black: "B",
  Red: "R",
  Green: "G",
};
