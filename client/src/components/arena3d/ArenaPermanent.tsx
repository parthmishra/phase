import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import {
  ARENA_PERMANENT_DEPTH,
  ARENA_PERMANENT_WIDTH,
  type ArenaPlacement,
} from "./arenaLayout.ts";
import { ArenaCardGlow } from "./ArenaCardGlow.tsx";
import { useArenaCardTexture } from "./useArenaCardTexture.ts";
import { useArenaPermanentInteraction } from "./useArenaPermanentInteraction.ts";
import { useGameStore } from "../../stores/gameStore.ts";

const CARD_WIDTH = ARENA_PERMANENT_WIDTH;
const CARD_HEIGHT = ARENA_PERMANENT_DEPTH;
const CARD_CORNER_RADIUS = 0.09;
const CARD_GEOMETRY = makeRoundedCardGeometry();

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
  const arrivalRingRef = useRef<THREE.Mesh>(null);
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

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const arrivalDuration = 0.52;
    arrivalAgeRef.current = Math.min(
      arrivalDuration,
      arrivalAgeRef.current + delta,
    );
    const arrivalProgress = arrivalAgeRef.current / arrivalDuration;
    const arrivalRing = arrivalRingRef.current;
    if (arrivalRing) {
      const ringScale = THREE.MathUtils.lerp(0.68, 1.46, arrivalProgress);
      arrivalRing.scale.setScalar(ringScale);
      const ringMaterial = arrivalRing.material as THREE.MeshBasicMaterial;
      ringMaterial.opacity = 0.46 * (1 - arrivalProgress) ** 2;
    }

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

  const glow = permanentGlow(interaction);

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
            (object.tapped ? CARD_HEIGHT : CARD_WIDTH) * cardScale * 1.1,
            (object.tapped ? CARD_WIDTH : CARD_HEIGHT) * cardScale * 1.1,
          ]}
        />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      <group ref={groupRef}>
        <mesh
          ref={arrivalRingRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
        >
          <ringGeometry args={[0.62, 0.72, 72]} />
          <meshBasicMaterial
            color="#f1cf83"
            transparent
            opacity={0.46}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {glow && (
          <ArenaCardGlow
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            padding={glow.padding}
            color={glow.color}
            opacity={glow.opacity}
            y={-0.004}
          />
        )}

        <mesh
          geometry={CARD_GEOMETRY}
          rotation={[-Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <meshBasicMaterial
            key={texture?.uuid ?? "arena-loading"}
            map={texture}
            color={texture ? "#ffffff" : "#19221f"}
            transparent
            alphaTest={0.06}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function permanentGlow(
  interaction: ArenaPermanentInteractionLike,
): { color: string; opacity: number; padding: number } | null {
  if (interaction.isAttacking || interaction.isBlocking) {
    return { color: "#f58b3b", opacity: 0.7, padding: 0.2 };
  }
  if (interaction.isValidTarget) {
    return { color: "#b9f65a", opacity: 0.82, padding: 0.24 };
  }
  if (interaction.hasProminentAction) {
    return { color: "#22d3ee", opacity: 0.78, padding: 0.24 };
  }
  if (interaction.isSelected) {
    return { color: "#f7e7b0", opacity: 0.55, padding: 0.2 };
  }
  return null;
}

interface ArenaPermanentInteractionLike {
  hasProminentAction: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  isSelected: boolean;
  isValidTarget: boolean;
}

function makeRoundedCardGeometry(): THREE.ShapeGeometry {
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

  const geometry = new THREE.ShapeGeometry(shape, 8);
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

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerpAngle(from: number, to: number, amount: number): number {
  return from + angleDelta(from, to) * amount;
}
