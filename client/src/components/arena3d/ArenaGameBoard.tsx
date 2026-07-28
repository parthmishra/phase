import { memo, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { PlayerId } from "../../adapter/types.ts";
import { usePerspectivePlayerId } from "../../hooks/usePlayerId.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { useUiStore } from "../../stores/uiStore.ts";
import {
  buildPlayerBattlefieldView,
  getOpponentIds,
  resolveFocusedOpponent,
} from "../../viewmodel/gameStateView.ts";
import { ArenaPermanent } from "./ArenaPermanent.tsx";
import { ArenaTable } from "./ArenaTable.tsx";
import { ArenaZonePiles } from "./ArenaZonePiles.tsx";
import { layoutArenaSeat } from "./arenaLayout.ts";

const ARENA_CAMERA_FOV = 34;

interface ArenaGameBoardProps {
  oppHud?: React.ReactNode;
  playerHud?: React.ReactNode;
  showOpponentCards?: boolean;
  onKickPlayer?: (playerId: PlayerId) => void;
  onViewZone?: (
    zone: "graveyard" | "exile" | "library",
    playerId: PlayerId,
  ) => void;
}

/**
 * Experimental gameplay renderer. The canvas owns spatial presentation while
 * the existing Phase HUD, hand, stack, dialogs, and dispatch pipeline remain
 * normal DOM layers around it.
 */
export const ArenaGameBoard = memo(function ArenaGameBoard(
  props: ArenaGameBoardProps,
) {
  const gameState = useGameStore((state) => state.gameState);
  const perspectivePlayerId = usePerspectivePlayerId();
  const focusedOpponent = useUiStore((state) => state.focusedOpponent);
  const opponents = useMemo(
    () => getOpponentIds(gameState, perspectivePlayerId),
    [gameState, perspectivePlayerId],
  );
  const opponentId =
    resolveFocusedOpponent(focusedOpponent, opponents) ?? opponents[0] ?? null;
  const playerView = useMemo(
    () => buildPlayerBattlefieldView(gameState, perspectivePlayerId),
    [gameState, perspectivePlayerId],
  );
  const opponentView = useMemo(
    () =>
      opponentId == null
        ? null
        : buildPlayerBattlefieldView(gameState, opponentId),
    [gameState, opponentId],
  );
  const placements = useMemo(
    () => [
      ...layoutArenaSeat(playerView, "local"),
      ...(opponentView ? layoutArenaSeat(opponentView, "opponent") : []),
    ],
    [opponentView, playerView],
  );

  if (!gameState) return null;

  return (
    <div className="relative min-h-0 flex-1 overflow-visible">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex -translate-y-[calc(100%+0.4rem)] justify-center">
        {props.oppHud}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
        {props.playerHud}
      </div>

      <div
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={{
          bottom:
            "calc(-1 * min(calc(0.18 * (100dvh - var(--game-top-overlay-offset, 0px))), 150px))",
        }}
      >
        <Canvas
          shadows
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ fov: ARENA_CAMERA_FOV, near: 0.1, far: 80 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          style={{ position: "absolute", inset: 0 }}
        >
          <ArenaCameraRig />
          <fog attach="fog" args={["#0d1420", 24, 42]} />
          <ambientLight intensity={0.78} color="#dce7f5" />
          <hemisphereLight
            args={["#c7d7ec", "#0b1018", 0.82]}
          />
          <directionalLight
            position={[-7, 12, -8]}
            intensity={1.72}
            color="#fff1cf"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={11}
            shadow-camera-bottom={-11}
          />
          <pointLight
            position={[0, 3.8, 0]}
            intensity={3.2}
            distance={12}
            color="#7596c7"
          />

          <ArenaTable />
          <ArenaZonePiles
            playerId={perspectivePlayerId}
            seat="local"
            onViewZone={props.onViewZone}
          />
          {opponentId != null && (
            <ArenaZonePiles
              playerId={opponentId}
              seat="opponent"
              onViewZone={props.onViewZone}
            />
          )}
          {placements.map((placement) => (
            <ArenaPermanent key={placement.objectId} {...placement} />
          ))}
        </Canvas>

      </div>
    </div>
  );
});

function ArenaCameraRig() {
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.4);
    const compact = aspect < 1.35;
    const target = compact
      ? new THREE.Vector3(0, 0, 0.65)
      : new THREE.Vector3(0, 0, 1.15);
    const direction = compact
      ? new THREE.Vector3(0, 0.86, 0.51).normalize()
      : new THREE.Vector3(0, 0.8, 0.6).normalize();
    const halfFov = (ARENA_CAMERA_FOV * Math.PI) / 360;
    const fitRadius = compact ? 9.2 : 8.25;
    const horizontalDistance = fitRadius / (Math.tan(halfFov) * aspect);
    const verticalDistance = fitRadius / Math.tan(halfFov);
    const distance = Math.max(
      horizontalDistance,
      verticalDistance * (compact ? 0.58 : 0.44),
    );
    const cameraPosition = direction.multiplyScalar(distance).add(target);

    perspective.position.copy(cameraPosition);
    perspective.fov = ARENA_CAMERA_FOV;
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
    perspective.lookAt(target);
    invalidate();
  }, [camera, invalidate, size.height, size.width]);

  return null;
}
