import {
  arenaLaneZoneLayouts,
  type ArenaPodPresentation,
  type ArenaSeat,
  type ArenaTableLayout,
} from "./arenaLayout.ts";

interface ArenaSeatZonesProps {
  seat: ArenaSeat;
  tableLayout: ArenaTableLayout;
  podPresentation: ArenaPodPresentation;
}

const BORDER_THICKNESS = 0.035;

export function ArenaSeatZones({
  seat,
  tableLayout,
  podPresentation,
}: ArenaSeatZonesProps) {
  const zones = arenaLaneZoneLayouts(
    seat,
    tableLayout,
    podPresentation,
  );
  const color = seat === "local" ? "#e9c875" : "#7d9fc6";
  const fillOpacity = seat === "local" ? 0.055 : 0.028;
  const borderOpacity = seat === "local" ? 0.58 : 0.34;

  return zones.map((zone) => (
    <group
      key={`${seat}-${zone.lane}`}
      position={zone.position}
      rotation={[0, zone.faceAngle, 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[zone.width, zone.depth]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={fillOpacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <ZoneBorder
        width={zone.width}
        depth={zone.depth}
        color={color}
        opacity={borderOpacity}
      />
    </group>
  ));
}

function ZoneBorder({
  width,
  depth,
  color,
  opacity,
}: {
  width: number;
  depth: number;
  color: string;
  opacity: number;
}) {
  return (
    <group position={[0, 0.004, 0]}>
      {[-1, 1].map((side) => (
        <mesh
          key={`horizontal-${side}`}
          position={[0, 0, side * depth / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width, BORDER_THICKNESS]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`vertical-${side}`}
          position={[side * width / 2, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[BORDER_THICKNESS, depth]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
