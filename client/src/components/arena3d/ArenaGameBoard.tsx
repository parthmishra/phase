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
import { layoutArenaSeat } from "./arenaLayout.ts";

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
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
        {props.oppHud}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
        {props.playerHud}
      </div>

      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 38, near: 0.1, far: 60 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ArenaCameraRig />
        <fog attach="fog" args={["#07100e", 19, 35]} />
        <ambientLight intensity={0.72} color="#d9ece4" />
        <hemisphereLight
          args={["#b9d7dd", "#10140f", 0.82]}
        />
        <directionalLight
          position={[-4, 10, 7]}
          intensity={1.58}
          color="#fff1cf"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
        />
        <pointLight
          position={[0, 3.8, 0]}
          intensity={7}
          distance={12}
          color="#b88b46"
        />

        <ArenaTable />
        {placements.map((placement) => (
          <ArenaPermanent key={placement.objectId} {...placement} />
        ))}
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(0,0,0,0.24)_100%)]" />
    </div>
  );
});

function ArenaCameraRig() {
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.4);
    const compact = aspect < 1.35;
    const cameraPosition = compact
      ? new THREE.Vector3(0, 14.2, 12.8)
      : new THREE.Vector3(0, 10.4, 11.8);
    const target = compact
      ? new THREE.Vector3(0, 0, 0.4)
      : new THREE.Vector3(0, 0, 0.9);

    perspective.position.copy(cameraPosition);
    perspective.fov = compact ? 42 : 38;
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
    perspective.lookAt(target);
    invalidate();
  }, [camera, invalidate, size.height, size.width]);

  return null;
}
