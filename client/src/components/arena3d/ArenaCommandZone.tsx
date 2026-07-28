import { useMemo } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { GameAction, GameObject, PlayerId } from "../../adapter/types.ts";
import { dispatchAction } from "../../game/dispatch.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { cardImageLookup } from "../../services/cardImageLookup.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { useUiStore } from "../../stores/uiStore.ts";
import {
  collectObjectActions,
  resolveSingleActionDispatch,
} from "../../viewmodel/cardActionChoice.ts";
import { commandZoneLeaders } from "../../viewmodel/commanderColumn.ts";
import { arenaComposableArtSource } from "./arenaArtSource.ts";
import { ArenaCardGlow } from "./ArenaCardGlow.tsx";
import { arenaZoneLayout, type ArenaSeat } from "./arenaLayout.ts";
import { useArenaImageTexture } from "./useArenaImageTexture.ts";

const COMMAND_CARD_WIDTH = 1.3;
const COMMAND_CARD_HEIGHT = 1.82;
const COMMAND_CARD_GAP = 1.47;

interface ArenaCommandZoneProps {
  playerId: PlayerId;
  seat: ArenaSeat;
}

/**
 * Commander cards and signature spells currently in the command zone. The
 * engine-authored command-zone selector and legal action map remain the sole
 * authorities for visibility and interaction; the Three.js scene only
 * presents them as a recognizable amber-framed tabletop zone.
 */
export function ArenaCommandZone({
  playerId,
  seat,
}: ArenaCommandZoneProps) {
  const gameState = useGameStore((state) => state.gameState);
  const leaders = useMemo(
    () => (gameState ? commandZoneLeaders(gameState, playerId) : []),
    [gameState, playerId],
  );
  const layout = arenaZoneLayout(seat);
  const inwardDirection = seat === "local" ? -1 : 1;

  return (
    <group>
      {leaders.map((leader, index) => (
        <ArenaCommandCard
          key={leader.id}
          object={leader}
          position={[
            layout.command[0] + inwardDirection * index * COMMAND_CARD_GAP,
            layout.command[1],
            layout.command[2],
          ]}
          faceAngle={layout.faceAngle}
        />
      ))}
    </group>
  );
}

interface ArenaCommandCardProps {
  object: GameObject;
  position: [number, number, number];
  faceAngle: number;
}

function ArenaCommandCard({
  object,
  position,
  faceAngle,
}: ArenaCommandCardProps) {
  const legalActionsByObject = useGameStore(
    (state) => state.legalActionsByObject,
  );
  const inspectObject = useUiStore((state) => state.inspectObject);
  const hoverObject = useUiStore((state) => state.hoverObject);
  const setPendingAbilityChoice = useUiStore(
    (state) => state.setPendingAbilityChoice,
  );
  const lookup = cardImageLookup(object);
  const { src } = useCardImage(lookup.name, {
    size: "normal",
    oracleId: lookup.oracleId,
    faceName: lookup.faceName,
    faceIndex: lookup.faceIndex,
  });
  const texture = useArenaImageTexture(
    src ? arenaComposableArtSource(src) : null,
  );
  const actions = useMemo(
    () => collectObjectActions(legalActionsByObject, object.id),
    [legalActionsByObject, object.id],
  );
  const isActionable = actions.length > 0;

  const handleAction = () => {
    if (actions.length === 0) return;
    const automatic = resolveSingleActionDispatch(actions, object);
    if (automatic) {
      void dispatchAction(automatic);
      return;
    }
    setPendingAbilityChoice({
      objectId: object.id,
      actions: actions as GameAction[],
    });
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoverObject(object.id);
    inspectObject(object.id);
    document.body.style.cursor = isActionable ? "pointer" : "zoom-in";
  };
  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoverObject(null);
    inspectObject(null);
    document.body.style.cursor = "";
  };

  return (
    <group
      position={position}
      rotation={[0, faceAngle, 0]}
      onClick={(event) => {
        event.stopPropagation();
        inspectObject(object.id, undefined, "immediate");
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        handleAction();
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {isActionable && (
        <ArenaCardGlow
          width={COMMAND_CARD_WIDTH}
          height={COMMAND_CARD_HEIGHT}
          padding={0.24}
          color="#22d3ee"
          opacity={0.78}
        />
      )}

      <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[COMMAND_CARD_WIDTH + 0.1, 0.07, COMMAND_CARD_HEIGHT + 0.1]}
        />
        <meshStandardMaterial
          color="#8d6b2b"
          emissive="#5f4314"
          emissiveIntensity={0.22}
          metalness={0.48}
          roughness={0.42}
        />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.076, 0]}
      >
        <planeGeometry args={[COMMAND_CARD_WIDTH, COMMAND_CARD_HEIGHT]} />
        <meshBasicMaterial
          key={texture?.uuid ?? "arena-command-loading"}
          map={texture}
          color={texture ? "#ffffff" : "#322814"}
          transparent
          alphaTest={0.04}
          toneMapped={false}
        />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.08, 0]}
      >
        <ringGeometry args={[0.52, 0.57, 72]} />
        <meshBasicMaterial
          color="#f2c96d"
          transparent
          opacity={texture ? 0 : 0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
