import { useMemo } from "react";
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
 * Card-shaped additive ring used for engine-authored actionable/target state.
 * Its transparent center mirrors the hand's CSS ring + shadow instead of
 * reading as a solid neon plate beneath the card.
 */
export function ArenaCardGlow({
  width,
  height,
  padding,
  color,
  opacity,
  y = -0.006,
}: ArenaCardGlowProps) {
  const shape = useMemo(
    () => makeRoundedRing(width, height, padding),
    [height, padding, width],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function makeRoundedRing(
  width: number,
  height: number,
  padding: number,
): THREE.Shape {
  const outerWidth = width + padding;
  const outerHeight = height + padding;
  const innerWidth = width + 0.035;
  const innerHeight = height + 0.035;
  const shape = new THREE.Shape();
  roundedRectangle(
    shape,
    -outerWidth / 2,
    -outerHeight / 2,
    outerWidth,
    outerHeight,
    Math.min(0.12, outerHeight * 0.09),
  );
  const hole = new THREE.Path();
  roundedRectangle(
    hole,
    -innerWidth / 2,
    -innerHeight / 2,
    innerWidth,
    innerHeight,
    Math.min(0.09, innerHeight * 0.07),
  );
  shape.holes.push(hole);
  return shape;
}

function roundedRectangle(
  path: THREE.Shape | THREE.Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
}
