/**
 * Download the runtime-only frame, font, and mana-symbol assets used by the
 * Arena 3D experiment. Copyrighted frame/font files stay gitignored.
 */
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cardConjurerRaw =
  "https://raw.githubusercontent.com/fiahdrgn473/CardConjurer/master";
const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(clientRoot, "public", "arena");
const manaFontSource = join(
  clientRoot,
  "node_modules",
  "mana-font",
  "fonts",
  "mana.woff2",
);

const frameColors = ["W", "U", "B", "R", "G", "M", "A", "V", "L"];
const statColors = ["W", "U", "B", "R", "G", "M", "A", "V", "C"];
const frames = [
  ...frameColors.map((color) => `img/frames/m15/regular/m15Frame${color}.png`),
  ...statColors.map((color) => `img/frames/m15/regular/m15PT${color}.png`),
];
const fonts = ["fonts/beleren-b.ttf", "fonts/mplantin.ttf"];
const pips = [
  ...Array.from({ length: 21 }, (_, index) => String(index)),
  "X",
  "C",
  "S",
  "P",
  "T",
  "Q",
  "E",
  "W",
  "U",
  "B",
  "R",
  "G",
  "WU",
  "WB",
  "UB",
  "UR",
  "BR",
  "BG",
  "RG",
  "RW",
  "GW",
  "GU",
  "2W",
  "2U",
  "2B",
  "2R",
  "2G",
  "WP",
  "UP",
  "BP",
  "RP",
  "GP",
];

async function fetchTo(url, destination) {
  try {
    await access(destination);
    return;
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

for (const relativePath of frames) {
  await fetchTo(
    `${cardConjurerRaw}/${relativePath}`,
    join(outputRoot, "frames", "m15", relativePath.split("/").at(-1)),
  );
}

for (const relativePath of fonts) {
  await fetchTo(
    `${cardConjurerRaw}/${relativePath}`,
    join(outputRoot, "fonts", relativePath.split("/").at(-1)),
  );
}

await mkdir(join(outputRoot, "fonts"), { recursive: true });
await copyFile(manaFontSource, join(outputRoot, "fonts", "mana.woff2"));

const { default: sharp } = await import("sharp");
for (const symbol of pips) {
  const destination = join(outputRoot, "pips", `${symbol}.png`);
  try {
    await access(destination);
    continue;
  } catch {
    const response = await fetch(
      `https://svgs.scryfall.io/card-symbols/${symbol}.svg`,
    );
    if (!response.ok) throw new Error(`${response.status} pip ${symbol}`);
    let svg = await response.text();
    if (!/<svg[^>]*\swidth=/.test(svg)) {
      svg = svg.replace("<svg ", "<svg width='100' height='100' ");
    }
    await mkdir(dirname(destination), { recursive: true });
    await sharp(Buffer.from(svg)).resize(232, 232).png().toFile(destination);
  }
}

console.log("Arena frame, font, and mana assets are ready.");
