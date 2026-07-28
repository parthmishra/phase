import { useEffect, useMemo } from "react";
import * as THREE from "three";

export const ARENA_TABLE_WIDTH = 20;
export const ARENA_TABLE_DEPTH = 18;

export function ArenaTable() {
  const surfaceTexture = useMemo(makeSurfaceTexture, []);

  useEffect(() => () => surfaceTexture.dispose(), [surfaceTexture]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.035, 0]}
        receiveShadow
      >
        <planeGeometry args={[ARENA_TABLE_WIDTH, ARENA_TABLE_DEPTH]} />
        <meshStandardMaterial
          map={surfaceTexture}
          color="#ffffff"
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>

      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry
          args={[ARENA_TABLE_WIDTH + 0.18, 0.36, ARENA_TABLE_DEPTH + 0.18]}
        />
        <meshStandardMaterial color="#0b1018" roughness={0.64} metalness={0.16} />
      </mesh>
    </group>
  );
}

function makeSurfaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 840;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  const base = context.createRadialGradient(
    canvas.width / 2,
    canvas.height * 0.62,
    48,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.74,
  );
  base.addColorStop(0, "#33445c");
  base.addColorStop(0.52, "#243247");
  base.addColorStop(1, "#111927");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Felt grain breaks up the flat color without introducing lane/field marks.
  context.globalAlpha = 0.035;
  for (let y = 0; y < canvas.height; y += 5) {
    for (let x = (y / 5) % 2; x < canvas.width; x += 7) {
      const shade = (x * 17 + y * 29) % 23;
      context.fillStyle = shade < 11 ? "#d8e2ef" : "#02050a";
      context.fillRect(x, y, 1, 1);
    }
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
