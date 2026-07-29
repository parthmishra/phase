import { memo, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { PlayerId } from "../../adapter/types.ts";
import { usePerspectivePlayerId } from "../../hooks/usePlayerId.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import {
  buildPlayerBattlefieldView,
  getOpponentIds,
  getSeatCount,
} from "../../viewmodel/gameStateView.ts";
import { ArenaPermanent } from "./ArenaPermanent.tsx";
import { ArenaTable } from "./ArenaTable.tsx";
import { ArenaZonePiles } from "./ArenaZonePiles.tsx";
import {
  assignArenaOpponentSeats,
  layoutArenaSeat,
  type ArenaTableLayout,
} from "./arenaLayout.ts";

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
  const opponents = useMemo(
    () => getOpponentIds(gameState, perspectivePlayerId),
    [gameState, perspectivePlayerId],
  );
  const seatOrder = useMemo(
    () =>
      gameState?.seat_order
      ?? gameState?.players.map((player) => player.id)
      ?? [],
    [gameState],
  );
  const tableLayout: ArenaTableLayout =
    getSeatCount(gameState) > 2 ? "pod" : "duel";
  const opponentSeats = useMemo(
    () =>
      assignArenaOpponentSeats(
        seatOrder,
        perspectivePlayerId,
        opponents,
      ),
    [opponents, perspectivePlayerId, seatOrder],
  );
  const playerView = useMemo(
    () => buildPlayerBattlefieldView(gameState, perspectivePlayerId),
    [gameState, perspectivePlayerId],
  );
  const opponentViews = useMemo(
    () =>
      new Map(
        opponentSeats.map(({ playerId }) => [
          playerId,
          buildPlayerBattlefieldView(gameState, playerId),
        ]),
      ),
    [gameState, opponentSeats],
  );
  const placements = useMemo(
    () => [
      ...layoutArenaSeat(playerView, "local", tableLayout),
      ...opponentSeats.flatMap(({ playerId, seat }) => {
        const view = opponentViews.get(playerId);
        return view ? layoutArenaSeat(view, seat, tableLayout) : [];
      }),
    ],
    [opponentSeats, opponentViews, playerView, tableLayout],
  );

  if (!gameState) return null;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-visible"
      data-arena-table-layout={tableLayout}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex -translate-y-[calc(100%+0.4rem)] justify-center">
        <div className="contents pointer-events-auto">{props.oppHud}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
        <div className="contents pointer-events-auto">{props.playerHud}</div>
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
          <ArenaCameraRig tableLayout={tableLayout} />
          <fog attach="fog" args={["#0d1420", 24, 42]} />
          <ambientLight intensity={0.78} color="#dce7f5" />
          <hemisphereLight
            args={["#c7d7ec", "#0b1018", 0.82]}
          />
          <directionalLight
            position={[-7, 12, -8]}
            intensity={1.72}
            color="#f2f6ff"
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

          <ArenaTable tableLayout={tableLayout} />
          <ArenaZonePiles
            playerId={perspectivePlayerId}
            seat="local"
            tableLayout={tableLayout}
            onViewZone={props.onViewZone}
          />
          {opponentSeats.map(({ playerId, seat }) => (
            <ArenaZonePiles
              key={playerId}
              playerId={playerId}
              seat={seat}
              tableLayout={tableLayout}
              onViewZone={props.onViewZone}
            />
          ))}
          {placements.map((placement) => (
            <ArenaPermanent key={placement.objectId} {...placement} />
          ))}
        </Canvas>

      </div>
    </div>
  );
});

function ArenaCameraRig({
  tableLayout,
}: {
  tableLayout: ArenaTableLayout;
}) {
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.4);
    const compact = aspect < 1.35;
    const target = compact
      ? new THREE.Vector3(0, 0, 0.65)
      : new THREE.Vector3(0, 0, tableLayout === "pod" ? 0.82 : 1.15);
    const direction = compact
      ? new THREE.Vector3(0, 0.86, 0.51).normalize()
      : new THREE.Vector3(0, 0.8, 0.6).normalize();
    const halfFov = (ARENA_CAMERA_FOV * Math.PI) / 360;
    const fitRadius = compact
      ? tableLayout === "pod" ? 9.75 : 9.2
      : tableLayout === "pod" ? 9 : 8.25;
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
  }, [camera, invalidate, size.height, size.width, tableLayout]);

  return null;
}
