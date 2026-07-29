import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import {
  ARENA_CARD_DEPTH,
  ARENA_CARD_WIDTH,
  type ArenaPlacement,
} from "./arenaLayout.ts";
import { ArenaCardGlow } from "./ArenaCardGlow.tsx";
import { useArenaCardTexture } from "./useArenaCardTexture.ts";
import { useArenaPermanentInteraction } from "./useArenaPermanentInteraction.ts";
import { useGameStore } from "../../stores/gameStore.ts";

const CARD_WIDTH = ARENA_CARD_WIDTH;
const CARD_HEIGHT = ARENA_CARD_DEPTH;
const CARD_CORNER_RADIUS = 0.09;
const CARD_THICKNESS = 0.026;
const CARD_FACE_GEOMETRY = makeRoundedCardFaceGeometry();
const CARD_BODY_GEOMETRY = makeRoundedCardBodyGeometry();

interface ArenaPermanentProps extends ArenaPlacement {
  pileCount: number;
}

export function ArenaPermanent({
  objectId,
  pileCount,
  position,
  faceAngle,
  attackVector,
  cardScale,
}: ArenaPermanentProps) {
  const object = useGameStore((state) => state.gameState?.objects[objectId]);
  const texture = useArenaCardTexture(objectId, pileCount);
  const interaction = useArenaPermanentInteraction(objectId);
  const groupRef = useRef<THREE.Group>(null);
  const arrivalAgeRef = useRef(0);
  const initialPlacementRef = useRef({
    attackVector,
    cardScale,
    faceAngle,
    position,
  });
  const { invalidate } = useThree();

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const initial = initialPlacementRef.current;
    group.position.set(
      initial.position[0] + initial.attackVector[0] * 0.14,
      initial.position[1] + 0.42,
      initial.position[2] + initial.attackVector[1] * 0.14,
    );
    group.rotation.y = initial.faceAngle;
    group.scale.setScalar(initial.cardScale * 0.86);
    invalidate();
  }, [invalidate]);

  useEffect(() => invalidate(), [
    faceAngle,
    cardScale,
    interaction.hasProminentAction,
    interaction.isActionable,
    interaction.isAttacking,
    interaction.isBlocking,
    interaction.isHovered,
    interaction.isSelected,
    interaction.isValidTarget,
    invalidate,
    object?.tapped,
    position,
    texture,
  ]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const arrivalDuration = 0.52;
    arrivalAgeRef.current = Math.min(
      arrivalDuration,
      arrivalAgeRef.current + delta,
    );
    const arrivalProgress = arrivalAgeRef.current / arrivalDuration;

    const response = 1 - Math.exp(-delta * 14);
    const targetX =
      position[0] + (interaction.isAttacking ? attackVector[0] : 0);
    const targetZ =
      position[2] + (interaction.isAttacking ? attackVector[1] : 0);
    const targetY =
      position[1]
      + (interaction.isAttacking ? 0.07 : 0)
      + (interaction.isHovered ? 0.045 : 0);
    const targetRotation =
      faceAngle + (object?.tapped ? Math.PI / 2 : 0);
    const targetScale = cardScale;

    group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, response);
    group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, response);
    group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, response);
    group.rotation.y = lerpAngle(group.rotation.y, targetRotation, response);
    const nextScale = THREE.MathUtils.lerp(
      group.scale.x,
      targetScale,
      response,
    );
    group.scale.setScalar(nextScale);

    const unsettled =
      Math.abs(group.position.x - targetX) > 0.001
      || Math.abs(group.position.y - targetY) > 0.001
      || Math.abs(group.position.z - targetZ) > 0.001
      || Math.abs(angleDelta(group.rotation.y, targetRotation)) > 0.001
      || Math.abs(group.scale.x - targetScale) > 0.001;
    if (unsettled || arrivalProgress < 1) invalidate();
  });

  if (!object) return null;

  const visualState = permanentVisualState(interaction);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    interaction.onPointerEnter();
    document.body.style.cursor = interaction.isActionable ? "pointer" : "zoom-in";
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    interaction.onPointerLeave();
    document.body.style.cursor = "";
  };

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        interaction.onClick();
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Keep a stationary raycast surface over the permanent's resting slot.
          Visual scale, arrival, tap, and combat motion must not move the hover
          target out from under the cursor and dismiss the inspection preview. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[position[0], position[1] + 0.24, position[2]]}
      >
        <planeGeometry
          args={[
            (object.tapped ? CARD_HEIGHT : CARD_WIDTH) * cardScale * 1.2,
            (object.tapped ? CARD_WIDTH : CARD_HEIGHT) * cardScale * 1.2,
          ]}
        />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      <group ref={groupRef}>
        {visualState.underglow && (
          <ArenaCardGlow
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            padding={visualState.underglow.padding}
            color={visualState.underglow.color}
            opacity={visualState.underglow.opacity}
            y={-0.004}
          />
        )}

        {visualState.bracketColor && (
          <ArenaTargetBrackets color={visualState.bracketColor} />
        )}

        <mesh
          geometry={CARD_BODY_GEOMETRY}
          rotation={[-Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#151820"
            roughness={0.98}
            metalness={0}
          />
        </mesh>

        <mesh
          geometry={CARD_FACE_GEOMETRY}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.003, 0]}
          receiveShadow
        >
          <meshLambertMaterial
            key={texture?.uuid ?? "arena-loading"}
            map={texture}
            color={texture ? "#ffffff" : "#171a20"}
            transparent
            alphaTest={0.06}
            emissive={texture ? "#050505" : "#080b10"}
            emissiveIntensity={texture ? 0.02 : 0.18}
            shadowSide={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

interface ArenaPermanentVisualState {
  bracketColor: string | null;
  underglow: {
    color: string;
    opacity: number;
    padding: number;
  } | null;
}

function permanentVisualState(
  interaction: ArenaPermanentInteractionLike,
): ArenaPermanentVisualState {
  if (interaction.isAttacking || interaction.isBlocking) {
    return {
      bracketColor: null,
      underglow: { color: "#c5784c", opacity: 0.24, padding: 0.2 },
    };
  }
  if (interaction.isValidTarget) {
    return { bracketColor: "#8bcbbd", underglow: null };
  }
  if (interaction.hasProminentAction) {
    return {
      bracketColor: null,
      underglow: { color: "#72b9ca", opacity: 0.26, padding: 0.28 },
    };
  }
  if (interaction.isSelected) {
    return { bracketColor: "#d8cfb2", underglow: null };
  }
  return { bracketColor: null, underglow: null };
}

interface ArenaPermanentInteractionLike {
  hasProminentAction: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  isSelected: boolean;
  isValidTarget: boolean;
}

function ArenaTargetBrackets({ color }: { color: string }) {
  const cornerX = CARD_WIDTH / 2 + 0.035;
  const cornerZ = CARD_HEIGHT / 2 + 0.035;
  const bracketLength = 0.21;
  const bracketWidth = 0.045;

  return (
    <group position={[0, 0.013, 0]}>
      {([-1, 1] as const).flatMap((xDirection) =>
        ([-1, 1] as const).flatMap((zDirection) => [
          <mesh
            key={`horizontal-${xDirection}-${zDirection}`}
            position={[
              xDirection * (cornerX - bracketLength / 2),
              0,
              zDirection * cornerZ,
            ]}
          >
            <boxGeometry args={[bracketLength, 0.012, bracketWidth]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.84}
              toneMapped={false}
            />
          </mesh>,
          <mesh
            key={`vertical-${xDirection}-${zDirection}`}
            position={[
              xDirection * cornerX,
              0,
              zDirection * (cornerZ - bracketLength / 2),
            ]}
          >
            <boxGeometry args={[bracketWidth, 0.012, bracketLength]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.84}
              toneMapped={false}
            />
          </mesh>,
        ]),
      )}
    </group>
  );
}

function makeRoundedCardShape(): THREE.Shape {
  const halfWidth = CARD_WIDTH / 2;
  const halfHeight = CARD_HEIGHT / 2;
  const radius = CARD_CORNER_RADIUS;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.absarc(
    halfWidth - radius,
    -halfHeight + radius,
    radius,
    -Math.PI / 2,
    0,
    false,
  );
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.absarc(
    halfWidth - radius,
    halfHeight - radius,
    radius,
    0,
    Math.PI / 2,
    false,
  );
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.absarc(
    -halfWidth + radius,
    halfHeight - radius,
    radius,
    Math.PI / 2,
    Math.PI,
    false,
  );
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.absarc(
    -halfWidth + radius,
    -halfHeight + radius,
    radius,
    Math.PI,
    Math.PI * 1.5,
    false,
  );
  shape.closePath();
  return shape;
}

function makeRoundedCardFaceGeometry(): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(makeRoundedCardShape(), 8);
  const halfWidth = CARD_WIDTH / 2;
  const halfHeight = CARD_HEIGHT / 2;
  const positions = geometry.getAttribute("position");
  const uvs = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index += 1) {
    uvs[index * 2] = (positions.getX(index) + halfWidth) / CARD_WIDTH;
    uvs[index * 2 + 1] =
      (positions.getY(index) + halfHeight) / CARD_HEIGHT;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

function makeRoundedCardBodyGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(makeRoundedCardShape(), {
    depth: CARD_THICKNESS,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -CARD_THICKNESS);
  return geometry;
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerpAngle(from: number, to: number, amount: number): number {
  return from + angleDelta(from, to) * amount;
}
