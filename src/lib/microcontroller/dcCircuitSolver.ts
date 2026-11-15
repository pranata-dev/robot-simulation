import type {
  MnaBranchReading,
  MnaCircuitSolution,
  PinId,
  WireConnection,
  WorkspacePart,
} from '@/types/simulator';

export interface DcSolverParameters {
  sourceVoltage: number;
  r1Ohms: number;
  r2Ohms: number;
  r3Ohms: number;
  rVarOhms: number;
  rxOhms: number;
}

const GALVANOMETER_COIL_OHMS = 5.0;
const SHORT_CIRCUIT_RESISTANCE_THRESHOLD = 0.05;
const BALANCED_CURRENT_THRESHOLD_AMPS = 5e-4;
const G_MIN_LEAKAGE = 1e-12;

function pinKey(partId: string, pinId: PinId): string {
  return `${partId}:${pinId}`;
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  if (n === 0) return [];

  const a = matrix.map((row) => [...row]);
  const b = [...rhs];

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row++) {
      const candidate = Math.abs(a[row][col]);
      if (candidate > maxAbs) {
        maxAbs = candidate;
        pivotRow = row;
      }
    }

    if (maxAbs < 1e-14 || !Number.isFinite(maxAbs)) {
      return null;
    }

    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow], a[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    const pivot = a[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / pivot;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) {
        a[row][k] -= factor * a[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let col = row + 1; col < n; col++) {
      sum -= a[row][col] * solution[col];
    }
    solution[row] = sum / a[row][row];
  }

  return solution;
}

function resolveComponentResistance(
  part: WorkspacePart,
  fallbackIndex: number,
  params: DcSolverParameters,
): number {
  if (part.type === 'potentiometer_rheostat') {
    return Math.max(1, params.rVarOhms);
  }
  if (part.type === 'galvanometer_ammeter') {
    return GALVANOMETER_COIL_OHMS;
  }
  switch (part.circuitRole) {
    case 'r1':
      return Math.max(1, params.r1Ohms);
    case 'r2':
      return Math.max(1, params.r2Ohms);
    case 'r3':
      return Math.max(1, params.r3Ohms);
    case 'rvar':
      return Math.max(1, params.rVarOhms);
    case 'rx':
      return Math.max(1, params.rxOhms);
    default: {
      if (typeof part.resistanceOhms === 'number' && Number.isFinite(part.resistanceOhms)) {
        return Math.max(1, part.resistanceOhms);
      }
      const lower = part.label.toLowerCase();
      if (lower.includes('r1')) return Math.max(1, params.r1Ohms);
      if (lower.includes('r2')) return Math.max(1, params.r2Ohms);
      if (lower.includes('r3')) return Math.max(1, params.r3Ohms);
      if (lower.includes('rx')) return Math.max(1, params.rxOhms);
      if (fallbackIndex === 0) return Math.max(1, params.r1Ohms);
      if (fallbackIndex === 1) return Math.max(1, params.r2Ohms);
      if (fallbackIndex === 2) return Math.max(1, params.r3Ohms);
      return 100;
    }
  }
}

export function solveDcCircuitMna(
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
  params: DcSolverParameters,
): MnaCircuitSolution {
  const dcSupply = workspaceParts.find((part) => part.type === 'dc_power_supply');
  const passiveParts = workspaceParts.filter(
    (part) =>
      part.type === 'resistor_component' ||
      part.type === 'potentiometer_rheostat' ||
      part.type === 'galvanometer_ammeter',
  );
  const breadboard = workspaceParts.find((part) => part.type === 'breadboard_base');

  if (!dcSupply && passiveParts.length === 0 && !breadboard) {
    return {
      hasDcCircuit: false,
      hasShortCircuit: false,
      hasOpenBranch: false,
      isBalanced: false,
      sourceVoltage: params.sourceVoltage,
      equivalentResistanceOhms: null,
      sourceCurrentAmps: 0,
      nodeVoltages: { nodeA: null, nodeB: null, nodeC: null, nodeD: null },
      bridgeDiffVolts: 0,
      galvanometerCurrentAmps: 0,
      branches: [],
      diagnostics: [],
    };
  }

  const parent = new Map<string, string>();
  const ensureKey = (key: string): string => {
    if (!parent.has(key)) parent.set(key, key);
    return key;
  };
  const findRoot = (key: string): string => {
    ensureKey(key);
    let curr = key;
    while (parent.get(curr) !== curr) {
      curr = parent.get(curr) ?? curr;
    }
    let compress = key;
    while (parent.get(compress) !== curr) {
      const next = parent.get(compress) ?? curr;
      parent.set(compress, curr);
      compress = next;
    }
    return curr;
  };
  const unionKeys = (a: string, b: string): void => {
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const wire of wires) {
    const k1 = pinKey(wire.fromPartId, wire.fromPinId);
    const k2 = pinKey(wire.toPartId, wire.toPinId);
    unionKeys(k1, k2);
  }

  const wiredPinSet = new Set<string>();
  for (const wire of wires) {
    wiredPinSet.add(pinKey(wire.fromPartId, wire.fromPinId));
    wiredPinSet.add(pinKey(wire.toPartId, wire.toPinId));
  }

  const diagnostics: string[] = [];
  if (!dcSupply) {
    diagnostics.push('No DC Power Supply found in workspace.');
    return {
      hasDcCircuit: true,
      hasShortCircuit: false,
      hasOpenBranch: true,
      isBalanced: false,
      sourceVoltage: params.sourceVoltage,
      equivalentResistanceOhms: null,
      sourceCurrentAmps: 0,
      nodeVoltages: { nodeA: null, nodeB: null, nodeC: null, nodeD: null },
      bridgeDiffVolts: 0,
      galvanometerCurrentAmps: 0,
      branches: [],
      diagnostics,
    };
  }

  const posRoot = findRoot(pinKey(dcSupply.id, 'DC_POS'));
  const negRoot = findRoot(pinKey(dcSupply.id, 'DC_NEG'));

  if (posRoot === negRoot) {
    diagnostics.push('Direct short circuit detected between DC +Vs and GND terminals.');
    return {
      hasDcCircuit: true,
      hasShortCircuit: true,
      hasOpenBranch: false,
      isBalanced: false,
      sourceVoltage: params.sourceVoltage,
      equivalentResistanceOhms: 0,
      sourceCurrentAmps: Infinity,
      nodeVoltages: { nodeA: 0, nodeB: null, nodeC: 0, nodeD: null },
      bridgeDiffVolts: 0,
      galvanometerCurrentAmps: 0,
      branches: [],
      diagnostics,
    };
  }

  const netIndexByRoot = new Map<string, number>();
  let nextNetIdx = 0;
  const getNonGroundNetIndex = (root: string): number | null => {
    if (root === negRoot) return null;
    const existing = netIndexByRoot.get(root);
    if (existing !== undefined) return existing;
    const assigned = nextNetIdx++;
    netIndexByRoot.set(root, assigned);
    return assigned;
  };

  getNonGroundNetIndex(posRoot);
  if (breadboard) {
    getNonGroundNetIndex(findRoot(pinKey(breadboard.id, 'BB_A')));
    getNonGroundNetIndex(findRoot(pinKey(breadboard.id, 'BB_B')));
    getNonGroundNetIndex(findRoot(pinKey(breadboard.id, 'BB_C')));
    getNonGroundNetIndex(findRoot(pinKey(breadboard.id, 'BB_D')));
  }

  interface PassiveEdge {
    part: WorkspacePart;
    pin1Root: string;
    pin2Root: string;
    resistanceOhms: number;
    isWiredBothEnds: boolean;
  }

  const edges: PassiveEdge[] = [];
  let resistorFallbackIndex = 0;
  let hasOpenBranch = false;

  for (const part of passiveParts) {
    let p1: PinId;
    let p2: PinId;
    if (part.type === 'resistor_component') {
      p1 = 'RES_1';
      p2 = 'RES_2';
    } else if (part.type === 'potentiometer_rheostat') {
      p1 = 'POT_1';
      p2 = 'POT_2';
    } else {
      p1 = 'GALV_POS';
      p2 = 'GALV_NEG';
    }

    const k1 = pinKey(part.id, p1);
    const k2 = pinKey(part.id, p2);
    const r1 = findRoot(k1);
    const r2 = findRoot(k2);
    const wired1 = wiredPinSet.has(k1);
    const wired2 = wiredPinSet.has(k2);
    const isWiredBothEnds = wired1 && wired2;

    if (!isWiredBothEnds) {
      hasOpenBranch = true;
      diagnostics.push(`Open branch: ${part.label} has an unconnected terminal.`);
    }

    const resistanceOhms = resolveComponentResistance(
      part,
      part.type === 'resistor_component' ? resistorFallbackIndex++ : -1,
      params,
    );

    if (isWiredBothEnds) {
      getNonGroundNetIndex(r1);
      getNonGroundNetIndex(r2);
    }

    edges.push({ part, pin1Root: r1, pin2Root: r2, resistanceOhms, isWiredBothEnds });
  }

  const nodeCount = nextNetIdx;
  const dim = nodeCount + 1;
  const A: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const rhs = new Array<number>(dim).fill(0);

  for (let i = 0; i < nodeCount; i++) {
    A[i][i] += G_MIN_LEAKAGE;
  }

  for (const edge of edges) {
    if (!edge.isWiredBothEnds) continue;
    const u = getNonGroundNetIndex(edge.pin1Root);
    const v = getNonGroundNetIndex(edge.pin2Root);
    const g = 1 / Math.max(edge.resistanceOhms, 1e-4);

    if (u !== null) A[u][u] += g;
    if (v !== null) A[v][v] += g;
    if (u !== null && v !== null) {
      A[u][v] -= g;
      A[v][u] -= g;
    }
  }

  const posIdx = getNonGroundNetIndex(posRoot);
  if (posIdx !== null) {
    A[posIdx][nodeCount] += 1;
    A[nodeCount][posIdx] += 1;
    rhs[nodeCount] = params.sourceVoltage;
  }

  const solved = solveLinearSystem(A, rhs);
  if (!solved) {
    diagnostics.push('MNA matrix solver could not converge (floating or singular circuit).');
    return {
      hasDcCircuit: true,
      hasShortCircuit: false,
      hasOpenBranch: true,
      isBalanced: false,
      sourceVoltage: params.sourceVoltage,
      equivalentResistanceOhms: null,
      sourceCurrentAmps: 0,
      nodeVoltages: { nodeA: null, nodeB: null, nodeC: null, nodeD: null },
      bridgeDiffVolts: 0,
      galvanometerCurrentAmps: 0,
      branches: [],
      diagnostics,
    };
  }

  const voltageOfRoot = (root: string): number => {
    if (root === negRoot) return 0;
    const idx = netIndexByRoot.get(root);
    if (idx === undefined) return 0;
    const val = solved[idx];
    return Number.isFinite(val) ? val : 0;
  };

  const sourceCurrentAmps = -solved[nodeCount];
  const equivalentResistanceOhms =
    Math.abs(sourceCurrentAmps) > 1e-9 ? Math.abs(params.sourceVoltage / sourceCurrentAmps) : null;

  const hasShortCircuit =
    equivalentResistanceOhms !== null && equivalentResistanceOhms < SHORT_CIRCUIT_RESISTANCE_THRESHOLD;

  if (hasShortCircuit) {
    diagnostics.push(
      `Low-impedance short circuit across DC supply (R_eq = ${equivalentResistanceOhms?.toFixed(3)} Ω).`,
    );
  }

  let galvanometerCurrentAmps = 0;
  const branches: MnaBranchReading[] = [];

  for (const edge of edges) {
    const v1 = edge.isWiredBothEnds ? voltageOfRoot(edge.pin1Root) : 0;
    const v2 = edge.isWiredBothEnds ? voltageOfRoot(edge.pin2Root) : 0;
    const drop = v1 - v2;
    const current = edge.isWiredBothEnds ? drop / edge.resistanceOhms : 0;
    const power = current * current * edge.resistanceOhms;

    if (edge.part.type === 'galvanometer_ammeter') {
      galvanometerCurrentAmps = current;
    }

    branches.push({
      partId: edge.part.id,
      label: edge.part.label,
      resistanceOhms: edge.resistanceOhms,
      currentAmps: current,
      voltageDropVolts: drop,
      powerWatts: power,
    });
  }

  const nodeA = breadboard ? voltageOfRoot(findRoot(pinKey(breadboard.id, 'BB_A'))) : voltageOfRoot(posRoot);
  const nodeB = breadboard ? voltageOfRoot(findRoot(pinKey(breadboard.id, 'BB_B'))) : null;
  const nodeC = breadboard ? voltageOfRoot(findRoot(pinKey(breadboard.id, 'BB_C'))) : 0;
  const nodeD = breadboard ? voltageOfRoot(findRoot(pinKey(breadboard.id, 'BB_D'))) : null;
  const bridgeDiffVolts = nodeB !== null && nodeD !== null ? nodeB - nodeD : 0;

  if (!wiredPinSet.has(pinKey(dcSupply.id, 'DC_POS')) || !wiredPinSet.has(pinKey(dcSupply.id, 'DC_NEG'))) {
    hasOpenBranch = true;
    diagnostics.push('DC Power Supply (+Vs or GND) is not wired to the breadboard.');
  }

  const hasGalv = passiveParts.some((p) => p.type === 'galvanometer_ammeter');
  const isBalanced =
    !hasShortCircuit &&
    !hasOpenBranch &&
    hasGalv &&
    Math.abs(galvanometerCurrentAmps) <= BALANCED_CURRENT_THRESHOLD_AMPS;

  return {
    hasDcCircuit: true,
    hasShortCircuit,
    hasOpenBranch,
    isBalanced,
    sourceVoltage: params.sourceVoltage,
    equivalentResistanceOhms,
    sourceCurrentAmps,
    nodeVoltages: { nodeA, nodeB, nodeC, nodeD },
    bridgeDiffVolts,
    galvanometerCurrentAmps,
    branches,
    diagnostics,
  };
}

