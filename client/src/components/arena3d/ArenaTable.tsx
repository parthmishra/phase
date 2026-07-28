import { useEffect, useMemo } from "react";
import * as THREE from "three";

const ARENA_TABLE_WIDTH = 17.2;
const ARENA_TABLE_DEPTH = 18;
const ARENA_TABLE_CORNER_RADIUS = 2.15;
const ARENA_TABLE_THICKNESS = 0.36;

export function ArenaTable() {
  const surfaceTexture = useMemo(makeSurfaceTexture, []);
  const surfaceGeometry = useMemo(
    () => makeRoundedSurfaceGeometry(
      ARENA_TABLE_WIDTH,
      ARENA_TABLE_DEPTH,
      ARENA_TABLE_CORNER_RADIUS,
    ),
    [],
  );
  const baseGeometry = useMemo(
    () => makeRoundedBaseGeometry(
      ARENA_TABLE_WIDTH + 0.18,
      ARENA_TABLE_DEPTH + 0.18,
      ARENA_TABLE_CORNER_RADIUS + 0.08,
      ARENA_TABLE_THICKNESS,
    ),
    [],
  );

  useEffect(
    () => () => {
      surfaceTexture.dispose();
      surfaceGeometry.dispose();
      baseGeometry.dispose();
    },
    [baseGeometry, surfaceGeometry, surfaceTexture],
  );

  return (
    <group>
      <mesh
        geometry={surfaceGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          map={surfaceTexture}
          color="#ffffff"
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>

      <mesh
        geometry={baseGeometry}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -0.045, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#080d14" roughness={0.98} metalness={0} />
      </mesh>
    </group>
  );
}

function makeRoundedRectangleShape(
  width: number,
  depth: number,
  radius: number,
): THREE.Shape {
  const x = -width / 2;
  const y = -depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.absarc(
    x + width - radius,
    y + radius,
    radius,
    -Math.PI / 2,
    0,
    false,
  );
  shape.lineTo(x + width, y + depth - radius);
  shape.absarc(
    x + width - radius,
    y + depth - radius,
    radius,
    0,
    Math.PI / 2,
    false,
  );
  shape.lineTo(x + radius, y + depth);
  shape.absarc(
    x + radius,
    y + depth - radius,
    radius,
    Math.PI / 2,
    Math.PI,
    false,
  );
  shape.lineTo(x, y + radius);
  shape.absarc(
    x + radius,
    y + radius,
    radius,
    Math.PI,
    Math.PI * 1.5,
    false,
  );
  shape.closePath();
  return shape;
}

function makeRoundedSurfaceGeometry(
  width: number,
  depth: number,
  radius: number,
): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(
    makeRoundedRectangleShape(width, depth, radius),
    24,
  );
  const positions = geometry.getAttribute("position");
  const uvs = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index += 1) {
    uvs[index * 2] = (positions.getX(index) + width / 2) / width;
    uvs[index * 2 + 1] = (positions.getY(index) + depth / 2) / depth;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

function makeRoundedBaseGeometry(
  width: number,
  depth: number,
  radius: number,
  thickness: number,
): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(
    makeRoundedRectangleShape(width, depth, radius),
    {
      depth: thickness,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.045,
      bevelThickness: 0.035,
      curveSegments: 24,
    },
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
  base.addColorStop(0, "#3a4b63");
  base.addColorStop(0.52, "#29384d");
  base.addColorStop(1, "#172235");
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
