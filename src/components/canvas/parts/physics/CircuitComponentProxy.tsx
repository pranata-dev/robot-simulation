'use client';

import { memo, useMemo } from 'react';
import { CuboidCollider, interactionGroups } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import PinNode from '@/components/canvas/parts/shared/PinNode';
import { PART_CATALOG, PINS_BY_PART } from '@/lib/constants/hardwareCatalog';
import { solveDcCircuitMna } from '@/lib/microcontroller/dcCircuitSolver';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { WorkspacePart } from '@/types/simulator';

interface CircuitComponentProxyProps {
  part: WorkspacePart;
}

const RESISTOR_COLOR_DIGITS = [
  '#111827', // 0 black
  '#78350f', // 1 brown
  '#dc2626', // 2 red
  '#ea580c', // 3 orange
  '#eab308', // 4 yellow
  '#16a34a', // 5 green
  '#2563eb', // 6 blue
  '#7c3aed', // 7 violet
  '#64748b', // 8 grey
  '#f8fafc', // 9 white
];

function getResistorBandColors(ohms: number): [string, string, string] {
  const safe = Math.max(10, Math.round(ohms));
  const digits = String(safe);
  const d1 = Number(digits[0]) || 1;
  const d2 = Number(digits[1] ?? '0') || 0;
  const mult = Math.max(0, Math.min(9, digits.length - 2));
  return [
    RESISTOR_COLOR_DIGITS[d1] ?? '#78350f',
    RESISTOR_COLOR_DIGITS[d2] ?? '#111827',
    RESISTOR_COLOR_DIGITS[mult] ?? '#78350f',
  ];
}

function useLiveMnaSolution() {
  const workspaceParts = useSimulationStore((s) => s.workspaceParts);
  const wires = useSimulationStore((s) => s.wires);
  const sourceVoltage = useSimulationStore((s) => s.sourceVoltage);
  const r1Ohms = useSimulationStore((s) => s.r1Ohms);
  const r2Ohms = useSimulationStore((s) => s.r2Ohms);
  const r3Ohms = useSimulationStore((s) => s.r3Ohms);
  const rVarOhms = useSimulationStore((s) => s.rVarOhms);
  const rxOhms = useSimulationStore((s) => s.rxOhms);

  return useMemo(
    () =>
      solveDcCircuitMna(workspaceParts, wires, {
        sourceVoltage,
        r1Ohms,
        r2Ohms,
        r3Ohms,
        rVarOhms,
        rxOhms,
      }),
    [workspaceParts, wires, sourceVoltage, r1Ohms, r2Ohms, r3Ohms, rVarOhms, rxOhms],
  );
}

function CircuitComponentProxy({ part }: CircuitComponentProxyProps) {
  const sourceVoltage = useSimulationStore((s) => s.sourceVoltage);
  const r1Ohms = useSimulationStore((s) => s.r1Ohms);
  const r2Ohms = useSimulationStore((s) => s.r2Ohms);
  const r3Ohms = useSimulationStore((s) => s.r3Ohms);
  const rVarOhms = useSimulationStore((s) => s.rVarOhms);
  const rxOhms = useSimulationStore((s) => s.rxOhms);
  const mna = useLiveMnaSolution();

  const entry = PART_CATALOG[part.type];
  const pins = PINS_BY_PART[part.type];
  const envGroups = interactionGroups(0, [0, 1]);
  const halfX = entry.dimensions[0] / 2;
  const halfY = entry.dimensions[1] / 2;
  const halfZ = entry.dimensions[2] / 2;

  const renderBody = () => {
    switch (part.type) {
      case 'dc_power_supply':
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.425, 0]}>
              <boxGeometry args={[1.5, 0.85, 0.95]} />
              <meshStandardMaterial color="#1e293b" metalness={0.35} roughness={0.5} />
            </mesh>
            {/* Front instrument face */}
            <mesh position={[0, 0.46, 0.48]}>
              <boxGeometry args={[1.38, 0.72, 0.02]} />
              <meshStandardMaterial color="#0f172a" roughness={0.6} />
            </mesh>
            {/* Digital voltage readout plate */}
            <mesh position={[-0.2, 0.56, 0.495]}>
              <boxGeometry args={[0.78, 0.3, 0.015]} />
              <meshStandardMaterial color="#052e16" emissive="#064e3b" emissiveIntensity={0.6} />
            </mesh>
            <Text position={[-0.2, 0.57, 0.51]} fontSize={0.14} color="#34d399" anchorX="center">
              {`${sourceVoltage.toFixed(1)} V`}
            </Text>
            <Text position={[0, 0.92, 0]} fontSize={0.11} color="#e2e8f0" anchorX="center">
              {`DC Supply ${mna.hasShortCircuit ? '(SHORT!)' : ''}`}
            </Text>
            {/* Red & black banana posts */}
            <mesh position={[0.35, 0.25, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.08, 16]} />
              <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.3} />
            </mesh>
            <mesh position={[0.56, 0.25, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.08, 16]} />
              <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.4} />
            </mesh>
          </group>
        );

      case 'breadboard_base':
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
              <boxGeometry args={[2.3, 0.14, 1.4]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.7} />
            </mesh>
            {/* Top red + rail strip & bottom blue - rail strip */}
            <mesh position={[0, 0.145, -0.55]}>
              <boxGeometry args={[2.1, 0.01, 0.035]} />
              <meshStandardMaterial color="#ef4444" />
            </mesh>
            <mesh position={[0, 0.145, 0.55]}>
              <boxGeometry args={[2.1, 0.01, 0.035]} />
              <meshStandardMaterial color="#2563eb" />
            </mesh>
            {/* Central DIP valley */}
            <mesh position={[0, 0.142, 0]}>
              <boxGeometry args={[2.1, 0.01, 0.1]} />
              <meshStandardMaterial color="#cbd5e1" />
            </mesh>
            <Text position={[0, 0.16, -0.3]} fontSize={0.09} color="#334155" rotation={[-Math.PI / 2, 0, 0]} anchorX="center">
              NODE A
            </Text>
            <Text position={[-0.48, 0.16, 0.18]} fontSize={0.09} color="#0369a1" rotation={[-Math.PI / 2, 0, 0]} anchorX="center">
              NODE B
            </Text>
            <Text position={[0, 0.16, 0.3]} fontSize={0.09} color="#334155" rotation={[-Math.PI / 2, 0, 0]} anchorX="center">
              NODE C
            </Text>
            <Text position={[0.48, 0.16, 0.18]} fontSize={0.09} color="#7e22ce" rotation={[-Math.PI / 2, 0, 0]} anchorX="center">
              NODE D
            </Text>
          </group>
        );

      case 'resistor_component': {
        const ohms =
          part.circuitRole === 'r1'
            ? r1Ohms
            : part.circuitRole === 'r2'
              ? r2Ohms
              : part.circuitRole === 'r3'
                ? r3Ohms
                : part.circuitRole === 'rx'
                  ? rxOhms
                  : part.resistanceOhms ?? 100;
        const [b1, b2, b3] = getResistorBandColors(ohms);
        return (
          <group>
            {/* Axial wire leads */}
            <mesh position={[0, 0.09, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.018, 0.018, 0.72, 10]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
            </mesh>
            {/* Ceramic peanut body */}
            <mesh position={[0, 0.09, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.068, 0.068, 0.36, 16]} />
              <meshStandardMaterial color="#e7d3b0" roughness={0.5} />
            </mesh>
            {/* EIA color bands */}
            <mesh position={[-0.1, 0.09, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.071, 0.071, 0.025, 16]} />
              <meshStandardMaterial color={b1} />
            </mesh>
            <mesh position={[-0.03, 0.09, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.071, 0.071, 0.025, 16]} />
              <meshStandardMaterial color={b2} />
            </mesh>
            <mesh position={[0.04, 0.09, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.071, 0.071, 0.025, 16]} />
              <meshStandardMaterial color={b3} />
            </mesh>
            <mesh position={[0.12, 0.09, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.071, 0.071, 0.022, 16]} />
              <meshStandardMaterial color="#d97706" metalness={0.6} roughness={0.3} />
            </mesh>
            <Text position={[0, 0.25, 0]} fontSize={0.1} color="#fde68a" anchorX="center">
              {`${part.label}: ${ohms.toFixed(0)} Ω`}
            </Text>
          </group>
        );
      }

      case 'potentiometer_rheostat': {
        const dialAngle = -((rVarOhms - 10) / 990) * Math.PI * 1.5 + Math.PI * 0.75;
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
              <boxGeometry args={[0.65, 0.28, 0.65]} />
              <meshStandardMaterial color="#0f766e" metalness={0.25} roughness={0.45} />
            </mesh>
            {/* Rotating dial knob */}
            <group position={[0, 0.32, 0]} rotation={[0, dialAngle, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.18, 0.2, 0.14, 24]} />
                <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.075, 0.09]}>
                <boxGeometry args={[0.025, 0.02, 0.15]} />
                <meshStandardMaterial color="#facc15" emissive="#eab308" emissiveIntensity={0.4} />
              </mesh>
            </group>
            <Text position={[0, 0.48, 0]} fontSize={0.1} color="#a7f3d0" anchorX="center">
              {`R_var: ${rVarOhms.toFixed(0)} Ω`}
            </Text>
          </group>
        );
      }

      case 'galvanometer_ammeter': {
        const currentMa = mna.galvanometerCurrentAmps * 1000;
        const normalizedDeflection = Math.max(-1, Math.min(1, currentMa / 50));
        const needleRotZ = -normalizedDeflection * (Math.PI / 4);
        const balancedColor = mna.isBalanced ? '#22c55e' : '#ef4444';
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.36, 0]}>
              <boxGeometry args={[1.05, 0.72, 0.8]} />
              <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.55} />
            </mesh>
            {/* Meter face */}
            <mesh position={[0, 0.44, 0.405]}>
              <boxGeometry args={[0.88, 0.46, 0.02]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} />
            </mesh>
            {/* Needle pivot + moving needle */}
            <group position={[0, 0.28, 0.42]} rotation={[0, 0, needleRotZ]}>
              <mesh position={[0, 0.16, 0]}>
                <boxGeometry args={[0.02, 0.32, 0.012]} />
                <meshStandardMaterial color="#dc2626" />
              </mesh>
            </group>
            {/* Balance status LED */}
            <mesh position={[0.36, 0.62, 0.41]}>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshStandardMaterial
                color={balancedColor}
                emissive={balancedColor}
                emissiveIntensity={0.9}
              />
            </mesh>
            <Text position={[0, 0.82, 0]} fontSize={0.11} color="#f8fafc" anchorX="center">
              {`Ig: ${currentMa >= 0 ? '+' : ''}${currentMa.toFixed(2)} mA`}
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
      {renderBody()}
      {pins.map((pin) => (
        <PinNode key={pin.id} partId={part.id} pin={pin} radius={0.042} />
      ))}
    </DraggableRigidPart>
  );
}

export default memo(CircuitComponentProxy);
