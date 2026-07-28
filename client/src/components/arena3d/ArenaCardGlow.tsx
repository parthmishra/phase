import { useEffect, useMemo } from "react";
import * as THREE from "three";

interface ArenaCardGlowProps {
  width: number;
  height: number;
  padding: number;
  color: string;
  opacity: number;
  y?: number;
}

/**
 * Card-shaped ring and soft bloom used for engine-authored actionable/target
 * state. Rendering both into one transparent texture mirrors the hand's CSS
 * ring + box-shadow without putting a solid neon plate beneath the card.
 */
export function ArenaCardGlow({
  width,
  height,
  padding,
  color,
  opacity,
  y = -0.006,
}: ArenaCardGlowProps) {
  const texture = useMemo(
    () => makeGlowTexture(width, height, padding, color),
    [color, height, padding, width],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry
        args={[width + padding * 1.7, height + padding * 1.7]}
      />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function makeGlowTexture(
  width: number,
  height: number,
  padding: number,
  color: string,
): THREE.CanvasTexture {
  const outerWidth = width + padding * 1.7;
  const outerHeight = height + padding * 1.7;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = Math.max(256, Math.round(768 * (outerHeight / outerWidth)));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  const unit = canvas.width / outerWidth;
  const cardWidth = width * unit;
  const cardHeight = height * unit;
  const x = (canvas.width - cardWidth) / 2;
  const y = (canvas.height - cardHeight) / 2;
  const radius = Math.min(cardWidth, cardHeight) * 0.065;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineJoin = "round";

  // Broad, low-opacity passes emulate the hand card's box-shadow bloom.
  for (const [lineWidth, alpha, blur] of [
    [11, 0.2, 48],
    [7, 0.34, 28],
  ] as const) {
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.shadowColor = color;
    context.shadowBlur = blur;
    roundedRectangle(context, x, y, cardWidth, cardHeight, radius);
    context.stroke();
    context.restore();
  }

  // A precise inner edge keeps the state legible at the far side of the table.
  context.save();
  context.globalAlpha = 0.96;
  context.strokeStyle = color;
  context.lineWidth = 4;
  roundedRectangle(context, x, y, cardWidth, cardHeight, radius);
  context.stroke();
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
