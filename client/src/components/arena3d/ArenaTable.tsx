import { useEffect, useMemo } from "react";
import * as THREE from "three";

const ARENA_TABLE_WIDTH = 17.4;
const ARENA_TABLE_DEPTH = 18;
const ARENA_TABLE_CORNER_RADIUS = 2.15;
const ARENA_TABLE_THICKNESS = 0.52;

export function ArenaTable() {
  const stoneTextures = useMemo(makeStoneTextures, []);
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
  const metalFrameGeometry = useMemo(
    () =>
      makeRoundedTubeGeometry(
        ARENA_TABLE_WIDTH - 0.16,
        ARENA_TABLE_DEPTH - 0.16,
        ARENA_TABLE_CORNER_RADIUS - 0.08,
        0.055,
      ),
    [],
  );
  const arcaneChannelGeometry = useMemo(
    () =>
      makeRoundedTubeGeometry(
        ARENA_TABLE_WIDTH - 0.48,
        ARENA_TABLE_DEPTH - 0.48,
        ARENA_TABLE_CORNER_RADIUS - 0.24,
        0.013,
      ),
    [],
  );

  useEffect(
    () => () => {
      stoneTextures.albedo.dispose();
      stoneTextures.bump.dispose();
      surfaceGeometry.dispose();
      baseGeometry.dispose();
      metalFrameGeometry.dispose();
      arcaneChannelGeometry.dispose();
    },
    [
      arcaneChannelGeometry,
      baseGeometry,
      metalFrameGeometry,
      stoneTextures,
      surfaceGeometry,
    ],
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
          map={stoneTextures.albedo}
          bumpMap={stoneTextures.bump}
          bumpScale={0.072}
          color="#d5dad9"
          roughness={0.84}
          metalness={0.045}
        />
      </mesh>

      <mesh geometry={metalFrameGeometry} position={[0, 0.045, 0]}>
        <meshStandardMaterial
          color="#725d3a"
          emissive="#1c1308"
          emissiveIntensity={0.2}
          roughness={0.34}
          metalness={0.78}
        />
      </mesh>
      <mesh geometry={arcaneChannelGeometry} position={[0, 0.057, 0]}>
        <meshStandardMaterial
          color="#67bcae"
          emissive="#279f91"
          emissiveIntensity={1.1}
          roughness={0.28}
          metalness={0.52}
          transparent
          opacity={0.38}
          toneMapped={false}
        />
      </mesh>

      <ArcaneSeal />

      <mesh
        geometry={baseGeometry}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -0.045, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          color="#090d0f"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

function ArcaneSeal() {
  const runes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = index / 12 * Math.PI * 2;
        return {
          angle,
          position: [
            Math.sin(angle) * 1.48,
            0.052,
            Math.cos(angle) * 1.48,
          ] as [number, number, number],
        };
      }),
    [],
  );

  return (
    <group>
      {[1.68, 1.36].map((radius) => (
        <mesh
          key={radius}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.046, 0]}
        >
          <torusGeometry args={[radius, radius === 1.68 ? 0.017 : 0.011, 8, 96]} />
          <meshStandardMaterial
            color="#6fd4c2"
            emissive="#35bca6"
            emissiveIntensity={1.15}
            roughness={0.25}
            metalness={0.35}
            transparent
            opacity={radius === 1.68 ? 0.25 : 0.14}
            toneMapped={false}
          />
        </mesh>
      ))}
      {runes.map(({ angle, position }, index) => (
        <mesh
          key={index}
          position={position}
          rotation={[0, angle, 0]}
        >
          <boxGeometry args={[0.026, 0.012, index % 2 === 0 ? 0.22 : 0.12]} />
          <meshStandardMaterial
            color="#70cab9"
            emissive="#35bca6"
            emissiveIntensity={0.95}
            transparent
            opacity={0.2}
            toneMapped={false}
          />
        </mesh>
      ))}
      <pointLight
        position={[0, 0.5, 0]}
        color="#4fd1bd"
        intensity={0.38}
        distance={4.8}
        decay={2}
      />
    </group>
  );
}

function makeRoundedTableShape(
  width: number,
  depth: number,
  radius: number,
): THREE.Shape {
  const localY = -depth / 2;
  const farY = depth / 2;
  const halfWidth = width / 2;
  const corners = [
    new THREE.Vector2(-halfWidth, localY),
    new THREE.Vector2(halfWidth, localY),
    new THREE.Vector2(halfWidth, farY),
    new THREE.Vector2(-halfWidth, farY),
  ];
  const rounded = corners.map((corner, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length];
    const next = corners[(index + 1) % corners.length];
    const incoming = previous.clone().sub(corner).normalize();
    const outgoing = next.clone().sub(corner).normalize();
    return {
      corner,
      incoming: corner.clone().addScaledVector(incoming, radius),
      outgoing: corner.clone().addScaledVector(outgoing, radius),
    };
  });
  const shape = new THREE.Shape();
  shape.moveTo(rounded[0].outgoing.x, rounded[0].outgoing.y);
  for (let index = 1; index <= rounded.length; index += 1) {
    const point = rounded[index % rounded.length];
    shape.lineTo(point.incoming.x, point.incoming.y);
    shape.quadraticCurveTo(
      point.corner.x,
      point.corner.y,
      point.outgoing.x,
      point.outgoing.y,
    );
  }
  shape.closePath();
  return shape;
}

function makeRoundedSurfaceGeometry(
  width: number,
  depth: number,
  radius: number,
): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(
    makeRoundedTableShape(width, depth, radius),
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
    makeRoundedTableShape(width, depth, radius),
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

function makeRoundedTubeGeometry(
  width: number,
  depth: number,
  radius: number,
  tubeRadius: number,
): THREE.TubeGeometry {
  const pathPoints = makeRoundedTableShape(width, depth, radius)
    .getSpacedPoints(192)
    .map((point) => new THREE.Vector3(point.x, 0, -point.y));
  const path = new THREE.CatmullRomCurve3(
    pathPoints,
    true,
    "centripetal",
    0.5,
  );
  return new THREE.TubeGeometry(path, 384, tubeRadius, 8, true);
}

interface StoneTextures {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

function makeStoneTextures(): StoneTextures {
  const size = 1024;
  const albedoCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const albedo = albedoCanvas.getContext("2d");
  const bump = bumpCanvas.getContext("2d");
  if (!albedo || !bump) throw new Error("2D canvas unavailable");

  const random = mulberry32(0x51a7e);
  const base = albedo.createRadialGradient(
    size * 0.48,
    size * 0.55,
    size * 0.04,
    size / 2,
    size / 2,
    size * 0.72,
  );
  base.addColorStop(0, "#465152");
  base.addColorStop(0.46, "#323c3d");
  base.addColorStop(0.78, "#212b2d");
  base.addColorStop(1, "#101719");
  albedo.fillStyle = base;
  albedo.fillRect(0, 0, size, size);
  bump.fillStyle = "#858585";
  bump.fillRect(0, 0, size, size);

  // Broad mineral blooms keep the surface organic without reading as tiles.
  for (let bloom = 0; bloom < 120; bloom += 1) {
    const x = random() * size;
    const y = random() * size;
    const radiusX = 18 + random() * 125;
    const radiusY = 10 + random() * 70;
    albedo.fillStyle = random() > 0.48
      ? "rgba(105, 126, 124, 0.025)"
      : "rgba(4, 8, 10, 0.055)";
    albedo.beginPath();
    albedo.ellipse(x, y, radiusX, radiusY, random() * Math.PI, 0, Math.PI * 2);
    albedo.fill();
  }

  // Fine pits catch the directional light through the bump map.
  for (let grain = 0; grain < 16000; grain += 1) {
    const x = random() * size;
    const y = random() * size;
    const value = 68 + Math.floor(random() * 50);
    const alpha = 0.025 + random() * 0.06;
    albedo.fillStyle = `rgba(${value}, ${value + 5}, ${value + 6}, ${alpha})`;
    albedo.fillRect(x, y, 0.6 + random() * 1.5, 0.6 + random() * 1.5);
    const height = 105 + Math.floor(random() * 55);
    bump.fillStyle = `rgb(${height}, ${height}, ${height})`;
    bump.fillRect(x, y, 0.7 + random() * 1.5, 0.7 + random() * 1.5);
  }

  // Layered mineral veins: dark cut, pale edge, and corresponding relief.
  for (let vein = 0; vein < 9; vein += 1) {
    let x = random() * size;
    let y = random() * size;
    const points: [number, number][] = [[x, y]];
    const segments = 5 + Math.floor(random() * 6);
    for (let segment = 0; segment < segments; segment += 1) {
      x += (random() - 0.46) * 170;
      y += (random() - 0.52) * 130;
      points.push([x, y]);
    }
    drawVein(albedo, points, "rgba(3, 8, 10, 0.42)", 3.2);
    drawVein(albedo, points, "rgba(130, 155, 151, 0.09)", 0.85);
    drawVein(bump, points, "rgba(45, 45, 45, 0.7)", 4.8);
    drawVein(bump, points, "rgba(170, 170, 170, 0.46)", 1.1);
  }

  const vignette = albedo.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 4, 6, 0.38)");
  albedo.fillStyle = vignette;
  albedo.fillRect(0, 0, size, size);

  const albedoTexture = new THREE.CanvasTexture(albedoCanvas);
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  albedoTexture.anisotropy = 8;
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.colorSpace = THREE.NoColorSpace;
  bumpTexture.anisotropy = 8;
  return { albedo: albedoTexture, bump: bumpTexture };
}

function drawVein(
  context: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  width: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) context.lineTo(x, y);
  context.stroke();
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
