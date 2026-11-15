'use client';

import { memo, useEffect, useMemo } from 'react';
import { CuboidCollider, interactionGroups } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import { PART_CATALOG } from '@/lib/constants/hardwareCatalog';
import { traceOpticsBench } from '@/lib/physics/opticsRaytracer';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { WorkspacePart } from '@/types/simulator';

interface OpticsBenchProxyProps {
  part: WorkspacePart;
}

const DEG_TO_RAD = Math.PI / 180;
const BEAM_HEIGHT = 0.55;

function createPrismGeometry(): THREE.ExtrudeGeometry {
  const r = 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(r, 0);
  shape.lineTo(-r * 0.5, r * 0.8660254);
  shape.lineTo(-r * 0.5, -r * 0.8660254);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.0,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export const OpticsRayOverlay = memo(function OpticsRayOverlay() {
  const workspaceParts = useSimulationStore((s) => s.workspaceParts);
  const laserYawDeg = useSimulationStore((s) => s.laserYawDeg);
  const laserPitchDeg = useSimulationStore((s) => s.laserPitchDeg);
  const opticalElementYawDeg = useSimulationStore((s) => s.opticalElementYawDeg);
  const refractiveIndex = useSimulationStore((s) => s.refractiveIndex);
  const lensFocalLength = useSimulationStore((s) => s.lensFocalLength);

  const trace = useMemo(
    () =>
      traceOpticsBench(workspaceParts, {
        laserYawDeg,
        laserPitchDeg,
        opticalElementYawDeg,
        refractiveIndex,
        lensFocalLength,
      }),
    [
      workspaceParts,
      laserYawDeg,
      laserPitchDeg,
      opticalElementYawDeg,
      refractiveIndex,
      lensFocalLength,
    ],
  );

  const beamMeshData = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    return trace.segments.map((seg) => {
      const start = new THREE.Vector3(...seg.start);
      const end = new THREE.Vector3(...seg.end);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = Math.max(0.001, dir.length());
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      return {
        mid: [mid.x, mid.y, mid.z] as [number, number, number],
        quat,
        len,
        hitPoint: seg.hitPoint,
        interaction: seg.interaction,
      };
    });
  }, [trace.segments]);

  const { normalGeometry, normalMaterial, normalSegments } = useMemo(() => {
    const verts: number[] = [];
    for (const seg of trace.segments) {
      if (!seg.hitPoint || !seg.hitNormal) continue;
      const hx = seg.hitPoint[0];
      const hy = seg.hitPoint[1];
      const hz = seg.hitPoint[2];
      const nx = seg.hitNormal[0];
      const ny = seg.hitNormal[1];
      const nz = seg.hitNormal[2];
      verts.push(
        hx - nx * 0.45,
        hy - ny * 0.45,
        hz - nz * 0.45,
        hx + nx * 0.65,
        hy + ny * 0.65,
        hz + nz * 0.65,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineDashedMaterial({
      color: '#fde047',
      dashSize: 0.08,
      gapSize: 0.05,
    });
    const lineSegs = new THREE.LineSegments(geo, mat);
    lineSegs.computeLineDistances();
    return { normalGeometry: geo, normalMaterial: mat, normalSegments: lineSegs };
  }, [trace.segments]);

  useEffect(() => {
    return () => {
      normalGeometry.dispose();
      normalMaterial.dispose();
    };
  }, [normalGeometry, normalMaterial]);

  if (!trace.hasOpticsBench || trace.segments.length === 0) return null;

  return (
    <group name="OPTICS_RAY_OVERLAY">
      {beamMeshData.map((seg, idx) => (
        <group key={`ray-seg-${idx}`}>
          <mesh position={seg.mid} quaternion={seg.quat}>
            <cylinderGeometry args={[0.016, 0.016, seg.len, 8]} />
            <meshBasicMaterial color={seg.interaction === 'TIR' ? '#f59e0b' : '#ef4444'} />
          </mesh>
          {seg.hitPoint && (
            <mesh position={seg.hitPoint}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshBasicMaterial
                color={seg.interaction === 'TARGET' ? '#22c55e' : '#f87171'}
              />
            </mesh>
          )}
        </group>
      ))}
      <primitive object={normalSegments} />
    </group>
  );
});

function OpticsBenchProxy({ part }: OpticsBenchProxyProps) {
  const laserYawDeg = useSimulationStore((s) => s.laserYawDeg);
  const laserPitchDeg = useSimulationStore((s) => s.laserPitchDeg);
  const opticalElementYawDeg = useSimulationStore((s) => s.opticalElementYawDeg);
  const refractiveIndex = useSimulationStore((s) => s.refractiveIndex);
  const lensFocalLength = useSimulationStore((s) => s.lensFocalLength);
  const workspaceParts = useSimulationStore((s) => s.workspaceParts);

  const trace = useMemo(
    () =>
      part.type === 'optical_target_screen'
        ? traceOpticsBench(workspaceParts, {
            laserYawDeg,
            laserPitchDeg,
            opticalElementYawDeg,
            refractiveIndex,
            lensFocalLength,
          })
        : null,
    [
      part.type,
      workspaceParts,
      laserYawDeg,
      laserPitchDeg,
      opticalElementYawDeg,
      refractiveIndex,
      lensFocalLength,
    ],
  );

  const prismGeo = useMemo(() => createPrismGeometry(), []);
  useEffect(() => {
    return () => {
      prismGeo.dispose();
    };
  }, [prismGeo]);

  const entry = PART_CATALOG[part.type];
  const envGroups = interactionGroups(0, [0, 1]);
  const halfX = entry.dimensions[0] / 2;
  const halfY = entry.dimensions[1] / 2;
  const halfZ = entry.dimensions[2] / 2;

  const extraYawRad =
    part.type === 'plane_mirror' || part.type === 'glass_prism'
      ? opticalElementYawDeg * DEG_TO_RAD
      : part.type === 'laser_emitter'
        ? laserYawDeg * DEG_TO_RAD
        : 0;
  const extraPitchRad = part.type === 'laser_emitter' ? laserPitchDeg * DEG_TO_RAD : 0;

  const renderElement = () => {
    switch (part.type) {
      case 'laser_emitter':
        return (
          <group>
            {/* Base rail pedestal */}
            <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
              <boxGeometry args={[0.9, 0.28, 0.48]} />
              <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
            </mesh>
            {/* Gimbaled He-Ne cylinder */}
            <group position={[0, BEAM_HEIGHT, 0]} rotation={[0, extraYawRad, extraPitchRad]}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.14, 0.14, 1.15, 20]} />
                <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
              </mesh>
            </group>
            <Text position={[0, 0.92, 0]} fontSize={0.11} color="#fca5a5" anchorX="center">
              632nm Laser
            </Text>
          </group>
        );

      case 'plane_mirror':
        return (
          <group rotation={[0, extraYawRad, 0]}>
            <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
              <boxGeometry args={[0.35, 0.1, 1.35]} />
              <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh castShadow position={[0, BEAM_HEIGHT, 0]}>
              <boxGeometry args={[0.06, 1.08, 1.35]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.06} />
            </mesh>
            <Text position={[0, 1.24, 0]} fontSize={0.1} color="#e2e8f0" anchorX="center">
              Mirror
            </Text>
          </group>
        );

      case 'convex_lens':
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
              <boxGeometry args={[0.35, 0.1, 1.2]} />
              <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0, BEAM_HEIGHT, 0]} scale={[0.2, 1, 1]}>
              <sphereGeometry args={[0.58, 24, 24]} />
              <meshPhysicalMaterial
                color="#7dd3fc"
                transparent
                opacity={0.5}
                roughness={0.08}
                metalness={0.05}
              />
            </mesh>
            <Text position={[0, 1.26, 0]} fontSize={0.1} color="#7dd3fc" anchorX="center">
              {`Convex (f=+${lensFocalLength.toFixed(1)}m)`}
            </Text>
          </group>
        );

      case 'concave_lens':
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
              <boxGeometry args={[0.35, 0.1, 1.2]} />
              <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
            </mesh>
            {/* Outer rim + biconcave glass profile */}
            <mesh position={[0, BEAM_HEIGHT, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.54, 0.07, 12, 28]} />
              <meshPhysicalMaterial color="#a5b4fc" transparent opacity={0.65} roughness={0.1} />
            </mesh>
            <mesh position={[0, BEAM_HEIGHT, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.52, 0.52, 0.06, 24]} />
              <meshPhysicalMaterial color="#818cf8" transparent opacity={0.35} roughness={0.1} />
            </mesh>
            <Text position={[0, 1.26, 0]} fontSize={0.1} color="#c7d2fe" anchorX="center">
              {`Concave (f=-${lensFocalLength.toFixed(1)}m)`}
            </Text>
          </group>
        );

      case 'glass_prism':
        return (
          <group rotation={[0, extraYawRad, 0]}>
            <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.68, 0.72, 0.08, 24]} />
              <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.6} />
            </mesh>
            <mesh geometry={prismGeo} position={[0, 0.08, 0]} castShadow>
              <meshPhysicalMaterial
                color="#bae6fd"
                transparent
                opacity={0.55}
                roughness={0.05}
                metalness={0.05}
              />
            </mesh>
            <Text position={[0, 1.25, 0]} fontSize={0.1} color="#bae6fd" anchorX="center">
              {`Prism (n=${refractiveIndex.toFixed(2)})`}
            </Text>
          </group>
        );

      case 'optical_target_screen': {
        const hit = Boolean(trace?.targetHit);
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
              <boxGeometry args={[0.35, 0.1, 1.45]} />
              <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh castShadow position={[0, BEAM_HEIGHT, 0]}>
              <boxGeometry args={[0.08, 1.15, 1.45]} />
              <meshStandardMaterial
                color={hit ? '#14532d' : '#0f172a'}
                emissive={hit ? '#22c55e' : '#000000'}
                emissiveIntensity={hit ? 0.35 : 0}
                roughness={0.6}
              />
            </mesh>
            {/* Target concentric ring */}
            <mesh position={[-0.045, BEAM_HEIGHT, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <ringGeometry args={[0.18, 0.24, 24]} />
              <meshBasicMaterial color={hit ? '#4ade80' : '#f87171'} />
            </mesh>
            <Text position={[0, 1.28, 0]} fontSize={0.11} color={hit ? '#4ade80' : '#cbd5e1'} anchorX="center">
              {hit ? 'TARGET HIT' : 'Target Screen'}
            </Text>
          </group>
        );
      }

      default:
        return null;
    }
  };

  return (
    <DraggableRigidPart
      id={part.id}
      partType={part.type}
      position={part.position}
      rotation={part.rotation}
      attachedTo={part.attachedTo}
      rigidBodyTypeOverride="fixed"
      colliders={false}
      includeDefaultCollider={false}
      collisionGroups={envGroups}
      customColliders={
        <CuboidCollider
          args={[halfX, halfY, halfZ]}
          position={[0, halfY, 0]}
          friction={0.8}
          restitution={0.05}
          collisionGroups={envGroups}
          solverGroups={envGroups}
        />
      }
    >
      {renderElement()}
    </DraggableRigidPart>
  );
}

export default memo(OpticsBenchProxy);
