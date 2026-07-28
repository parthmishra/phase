import { useEffect, useMemo } from "react";
import * as THREE from "three";

const TABLE_WIDTH = 14.8;
const TABLE_DEPTH = 13.2;

export function ArenaTable() {
  const surfaceTexture = useMemo(makeSurfaceTexture, []);

  useEffect(() => () => surfaceTexture.dispose(), [surfaceTexture]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.06, 0]}
        receiveShadow
      >
        <planeGeometry args={[TABLE_WIDTH, TABLE_DEPTH]} />
        <meshStandardMaterial
          map={surfaceTexture}
          color="#ffffff"
          roughness={0.86}
          metalness={0.04}
        />
      </mesh>

      <mesh position={[0, -0.2, -TABLE_DEPTH / 2]} receiveShadow>
        <boxGeometry args={[TABLE_WIDTH + 0.42, 0.36, 0.34]} />
        <meshStandardMaterial color="#292e2b" roughness={0.42} metalness={0.44} />
      </mesh>
      <mesh position={[0, -0.2, TABLE_DEPTH / 2]} receiveShadow>
        <boxGeometry args={[TABLE_WIDTH + 0.42, 0.36, 0.34]} />
        <meshStandardMaterial color="#292e2b" roughness={0.42} metalness={0.44} />
      </mesh>
      <mesh position={[-TABLE_WIDTH / 2, -0.2, 0]} receiveShadow>
        <boxGeometry args={[0.34, 0.36, TABLE_DEPTH]} />
        <meshStandardMaterial color="#292e2b" roughness={0.42} metalness={0.44} />
      </mesh>
      <mesh position={[TABLE_WIDTH / 2, -0.2, 0]} receiveShadow>
        <boxGeometry args={[0.34, 0.36, TABLE_DEPTH]} />
        <meshStandardMaterial color="#292e2b" roughness={0.42} metalness={0.44} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.74, 0.78, 96]} />
        <meshBasicMaterial
          color="#be9b55"
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function makeSurfaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1068;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  const base = context.createRadialGradient(
    canvas.width / 2,
    canvas.height * 0.58,
    20,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.72,
  );
  base.addColorStop(0, "#3a524a");
  base.addColorStop(0.48, "#263d36");
  base.addColorStop(1, "#12231e");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.24;
  context.strokeStyle = "#a9c2a7";
  context.lineWidth = 2;
  context.setLineDash([12, 16]);
  const laneY = [250, 402, 666, 818];
  laneY.forEach((y) => {
    context.beginPath();
    context.moveTo(94, y);
    context.lineTo(canvas.width - 94, y);
    context.stroke();
  });

  context.setLineDash([]);
  context.globalAlpha = 0.14;
  context.strokeStyle = "#d7b96d";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 68, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 124, 0, Math.PI * 2);
  context.stroke();

  context.globalAlpha = 0.055;
  for (let x = -canvas.height; x < canvas.width; x += 54) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + canvas.height, canvas.height);
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
