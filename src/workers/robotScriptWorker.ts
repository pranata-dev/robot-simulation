import type {
  WorkerInboundMessage,
  WorkerLogLevel,
  WorkerOutboundMessage,
} from '@/types/simulator';

interface WorkerMessageEvent {
  data: WorkerInboundMessage;
}

interface RobotWorkerGlobal {
  postMessage: (message: WorkerOutboundMessage) => void;
  onmessage: ((event: WorkerMessageEvent) => void) | null;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

const workerScope = globalThis as unknown as RobotWorkerGlobal;

const HEARTBEAT_INTERVAL_MS = 150;
const MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS = 50;
const MIN_LOOP_FALLBACK_DELAY_MS = 50;
const MAX_COMMANDS_PER_WINDOW = 250;
const COMMAND_WINDOW_MS = 1000;
const MAX_DELAY_MS = 60_000;
const MIN_SERVO_ANGLE_DEG = -60;
const MAX_SERVO_ANGLE_DEG = 60;
const DECLARATIVE_LINE_PATTERN = /^(PIN_\d+|P\d+|ESP_D\d+|D\d+|\d+)\s*:\s*(-?\d+(?:\.\d+)?)$/i;
const OBSTACLE_WAIT_PATTERN = /^WAIT_UNTIL_OBSTACLE_LESS\s*:\s*(-?\d+(?:\.\d+)?)$/i;
const IF_OBSTACLE_PATTERN = /^IF_OBSTACLE_LESS_THAN\s*:\s*(-?\d+(?:\.\d+)?)$/i;

function normalizePinOrServoTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  const pinMatch = trimmed.match(/^(PIN_\d+|P\d+|ESP_D\d+|D\d+|\d+)$/i);
  if (pinMatch) {
    return pinMatch[1].toUpperCase();
  }
  return trimmed;
}

type DslCommand =
  | { type: 'PIN'; pin: string; angle: number }
  | { type: 'DELAY'; ms: number }
  | { type: 'WAIT_UNTIL_OBSTACLE_LESS'; thresholdCm: number }
  | { type: 'IF_OBSTACLE_LESS_THAN'; thresholdCm: number; falseJumpIndex: number }
  | { type: 'ELSE'; endIfIndex: number }
  | { type: 'END_IF' }
  | { type: 'LOOP' };

interface DslStepCommand {
  servoTarget: string;
  angleDeg: number;
}

let activeRunId = 0;
let activeTimerId: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimerId: ReturnType<typeof setInterval> | null = null;
let activeSleepReject: ((reason?: unknown) => void) | null = null;
let latestSensorDistances: Record<string, number> = {};
let latestBatteryLevel = 100;

function assertBatteryRemaining(): void {
  if (latestBatteryLevel <= 0) {
    throw new Error('ERROR: BATTERY DEPLETED');
  }
}

function getMinSensorDistanceCm(): number {
  let min = Number.POSITIVE_INFINITY;
  for (const val of Object.values(latestSensorDistances)) {
    if (typeof val === 'number' && Number.isFinite(val) && val < min) {
      min = val;
    }
  }
  return min;
}

function clearTimers(): void {
  if (activeTimerId !== null) {
    workerScope.clearTimeout(activeTimerId);
    activeTimerId = null;
  }
  activeSleepReject = null;
  if (heartbeatTimerId !== null) {
    workerScope.clearInterval(heartbeatTimerId);
    heartbeatTimerId = null;
  }
}

function postLog(runId: number, level: WorkerLogLevel, message: string): void {
  workerScope.postMessage({
    type: 'LOG',
    runId,
    level,
    message,
  });
}

function formatLogArgs(args: readonly unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number' || typeof arg === 'boolean' || arg === null || arg === undefined) {
        return String(arg);
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return Object.prototype.toString.call(arg);
      }
    })
    .join(' ');
}

function sleepWithAbort(ms: number, runId: number): Promise<void> {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.min(MAX_DELAY_MS, ms)) : 0;
  return new Promise((resolve, reject) => {
    if (runId !== activeRunId) {
      reject(new Error('__SCRIPT_ABORTED__'));
      return;
    }
    if (latestBatteryLevel <= 0) {
      reject(new Error('ERROR: BATTERY DEPLETED'));
      return;
    }
    activeSleepReject = reject;
    activeTimerId = workerScope.setTimeout(() => {
      activeTimerId = null;
      activeSleepReject = null;
      if (runId !== activeRunId) {
        reject(new Error('__SCRIPT_ABORTED__'));
        return;
      }
      if (latestBatteryLevel <= 0) {
        reject(new Error('ERROR: BATTERY DEPLETED'));
        return;
      }
      resolve();
    }, safeMs);
  });
}

function stripDslComment(rawLine: string): string {
  const hashIdx = rawLine.indexOf('#');
  const slashIdx = rawLine.indexOf('//');
  let cutoff = rawLine.length;
  if (hashIdx >= 0) cutoff = Math.min(cutoff, hashIdx);
  if (slashIdx >= 0) cutoff = Math.min(cutoff, slashIdx);
  return rawLine.slice(0, cutoff).trim();
}

function isDeclarativeScript(script: string): boolean {
  const lines = script.split(/\r?\n/);
  let hasDirective = false;
  for (const rawLine of lines) {
    const line = stripDslComment(rawLine);
    if (!line) {
      continue;
    }
    if (/[=(){};]|=>|\b(const|let|var|function|async|await|for|while|if)\b/.test(line)) {
      return false;
    }
    const upper = line.toUpperCase();
    if (
      upper === 'LOOP' ||
      upper === 'END' ||
      upper === 'ELSE' ||
      upper === 'END_IF' ||
      /^DELAY\s*:/i.test(line) ||
      OBSTACLE_WAIT_PATTERN.test(line) ||
      IF_OBSTACLE_PATTERN.test(line) ||
      DECLARATIVE_LINE_PATTERN.test(line)
    ) {
      hasDirective = true;
    }
  }
  return hasDirective;
}

function parseDeclarativeCommands(script: string): {
  commands: DslCommand[];
  hasLoop: boolean;
} {
  const rawLines = script.split(/\r?\n/);
  const commands: DslCommand[] = [];
  const ifStack: Array<{ ifIndex: number; elseIndex: number | null; lineNumber: number }> = [];
  let hasLoop = false;

  for (let index = 0; index < rawLines.length; index++) {
    const line = stripDslComment(rawLines[index]);
    if (!line) continue;

    const upper = line.toUpperCase();
    if (upper === 'LOOP') {
      hasLoop = true;
      commands.push({ type: 'LOOP' });
      continue;
    }

    if (upper === 'END') {
      continue;
    }

    const ifMatch = line.match(IF_OBSTACLE_PATTERN);
    if (ifMatch) {
      const thresholdCm = Number(ifMatch[1]);
      if (!Number.isFinite(thresholdCm) || thresholdCm < 0) {
        throw new Error(`Invalid obstacle distance threshold on line ${index + 1}: "${line}".`);
      }
      const ifIndex = commands.length;
      commands.push({
        type: 'IF_OBSTACLE_LESS_THAN',
        thresholdCm,
        falseJumpIndex: -1,
      });
      ifStack.push({ ifIndex, elseIndex: null, lineNumber: index + 1 });
      continue;
    }

    if (upper === 'ELSE') {
      const top = ifStack[ifStack.length - 1];
      if (!top) {
        throw new Error(`Unexpected ELSE without matching IF_OBSTACLE_LESS_THAN on line ${index + 1}.`);
      }
      if (top.elseIndex !== null) {
        throw new Error(`Duplicate ELSE on line ${index + 1} for IF block starting on line ${top.lineNumber}.`);
      }
      const elseIndex = commands.length;
      commands.push({ type: 'ELSE', endIfIndex: -1 });
      top.elseIndex = elseIndex;
      const ifCmd = commands[top.ifIndex];
      if (ifCmd.type === 'IF_OBSTACLE_LESS_THAN') {
        ifCmd.falseJumpIndex = elseIndex + 1;
      }
      continue;
    }

    if (upper === 'END_IF') {
      const frame = ifStack.pop();
      if (!frame) {
        throw new Error(`Unexpected END_IF without matching IF_OBSTACLE_LESS_THAN on line ${index + 1}.`);
      }
      const endIfIndex = commands.length;
      commands.push({ type: 'END_IF' });
      if (frame.elseIndex !== null) {
        const elseCmd = commands[frame.elseIndex];
        if (elseCmd.type === 'ELSE') {
          elseCmd.endIfIndex = endIfIndex;
        }
      } else {
        const ifCmd = commands[frame.ifIndex];
        if (ifCmd.type === 'IF_OBSTACLE_LESS_THAN') {
          ifCmd.falseJumpIndex = endIfIndex + 1;
        }
      }
      continue;
    }

    if (/^DELAY\s*:/i.test(line)) {
      const colonIdx = line.indexOf(':');
      const rawValue = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : '';
      const ms = rawValue ? Number(rawValue) : Number.NaN;
      if (!Number.isFinite(ms) || ms < 0 || ms > MAX_DELAY_MS) {
        throw new Error(`Invalid DELAY value on line ${index + 1}: "${line}".`);
      }
      commands.push({ type: 'DELAY', ms });
      continue;
    }

    const obstacleMatch = line.match(OBSTACLE_WAIT_PATTERN);
    if (obstacleMatch) {
      const thresholdCm = Number(obstacleMatch[1]);
      if (!Number.isFinite(thresholdCm) || thresholdCm < 0) {
        throw new Error(`Invalid obstacle distance threshold on line ${index + 1}: "${line}".`);
      }
      commands.push({ type: 'WAIT_UNTIL_OBSTACLE_LESS', thresholdCm });
      continue;
    }

    const match = line.match(DECLARATIVE_LINE_PATTERN);
    if (match) {
      const pin = normalizePinOrServoTarget(match[1].toUpperCase());
      const parsedAngle = Number(match[2]);
      if (!Number.isFinite(parsedAngle)) {
        throw new Error(`Invalid servo angle on line ${index + 1}: "${line}".`);
      }
      const angle = Math.max(
        MIN_SERVO_ANGLE_DEG,
        Math.min(MAX_SERVO_ANGLE_DEG, parsedAngle),
      );
      commands.push({ type: 'PIN', pin, angle });
      continue;
    }

    throw new Error(`Syntax error in DSL script on line ${index + 1}: "${line}".`);
  }

  if (ifStack.length > 0) {
    const unclosed = ifStack[ifStack.length - 1];
    throw new Error(`Missing END_IF for IF_OBSTACLE_LESS_THAN starting on line ${unclosed.lineNumber}.`);
  }

  return { commands, hasLoop };
}

function formatPinStateSummary(pinStates: Record<string, number>): string {
  return Object.entries(pinStates)
    .map(([pin, angle]) => `${pin}: ${angle}deg`)
    .join(', ');
}

async function runDeclarativeScript(script: string, runId: number): Promise<void> {
  const { commands, hasLoop } = parseDeclarativeCommands(script);
  const currentPinStates: Record<string, number> = {};
  const lastBranchOutcomeByPc = new Map<number, boolean>();
  let lastLoggedSummary = '';
  let isRunning = true;

  const flushBatch = (batch: DslStepCommand[], forceLog: boolean): void => {
    assertBatteryRemaining();
    if (batch.length === 0) return;

    workerScope.postMessage({
      type: 'SET_SERVO_BATCH',
      runId,
      commands: batch,
    });

    for (const cmd of batch) {
      currentPinStates[cmd.servoTarget] = cmd.angleDeg;
    }

    const summary = formatPinStateSummary(currentPinStates);
    if (forceLog || summary !== lastLoggedSummary) {
      lastLoggedSummary = summary;
      postLog(runId, 'info', `Pins -> ${summary}`);
    }
  };

  while (isRunning && runId === activeRunId) {
    assertBatteryRemaining();
    let pendingBatch: DslStepCommand[] = [];
    let totalDelayMsThisPass = 0;
    let pc = 0;

    while (pc < commands.length) {
      if (!isRunning || runId !== activeRunId) return;
      assertBatteryRemaining();
      const cmd = commands[pc];

      if (cmd.type === 'PIN') {
        pendingBatch.push({ servoTarget: cmd.pin, angleDeg: cmd.angle });
        pc += 1;
        continue;
      }

      if (cmd.type === 'DELAY') {
        flushBatch(pendingBatch, cmd.ms > 0);
        pendingBatch = [];
        totalDelayMsThisPass += cmd.ms;
        await sleepWithAbort(cmd.ms, runId);
        pc += 1;
        continue;
      }

      if (cmd.type === 'IF_OBSTACLE_LESS_THAN') {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
        const currentMin = getMinSensorDistanceCm();
        const isTriggered = currentMin < cmd.thresholdCm;
        if (lastBranchOutcomeByPc.get(pc) !== isTriggered) {
          lastBranchOutcomeByPc.set(pc, isTriggered);
          const distLabel = Number.isFinite(currentMin) ? `${currentMin.toFixed(1)} cm` : 'clear';
          postLog(
            runId,
            'info',
            isTriggered
              ? `Obstacle ${distLabel} < ${cmd.thresholdCm} cm -> avoiding (IF branch)`
              : `Path ${distLabel} >= ${cmd.thresholdCm} cm -> forward gait (ELSE branch)`,
          );
        }
        pc = isTriggered ? pc + 1 : cmd.falseJumpIndex;
        continue;
      }

      if (cmd.type === 'ELSE') {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
        pc = cmd.endIfIndex + 1;
        continue;
      }

      if (cmd.type === 'END_IF') {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
        pc += 1;
        continue;
      }

      if (cmd.type === 'WAIT_UNTIL_OBSTACLE_LESS') {
        flushBatch(pendingBatch, true);
        pendingBatch = [];
        postLog(runId, 'info', `Waiting until obstacle < ${cmd.thresholdCm} cm...`);
        while (isRunning && runId === activeRunId) {
          assertBatteryRemaining();
          const currentMin = getMinSensorDistanceCm();
          if (currentMin < cmd.thresholdCm) {
            postLog(
              runId,
              'info',
              `Obstacle detected at ${currentMin.toFixed(1)} cm (< ${cmd.thresholdCm} cm) — continuing.`,
            );
            break;
          }
          totalDelayMsThisPass += MIN_LOOP_FALLBACK_DELAY_MS;
          await sleepWithAbort(MIN_LOOP_FALLBACK_DELAY_MS, runId);
        }
        pc += 1;
        continue;
      }

      if (cmd.type === 'LOOP') {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
      }
      pc += 1;
    }

    flushBatch(pendingBatch, false);

    if (!hasLoop) {
      isRunning = false;
      break;
    }

    if (totalDelayMsThisPass === 0) {
      await sleepWithAbort(MIN_LOOP_FALLBACK_DELAY_MS, runId);
    }
  }
}

type AsyncScriptRunner = (
  setServoAngle: (servoId: string, angle: number) => void,
  delay: (ms: number) => Promise<void>,
  loop: (fn: () => void | Promise<void>) => Promise<void>,
  log: (...args: unknown[]) => void,
  consoleObj: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  },
  getUltrasonicDistance: () => number,
  waitUntilObstacleLess: (thresholdCm: number) => Promise<void>,
  ...shadowedGlobals: undefined[]
) => Promise<void>;

const AsyncFunctionCtor = Object.getPrototypeOf(async function noop() {
  // Intentionally empty reference function to derive AsyncFunction without eval().
}).constructor as new (...args: string[]) => AsyncScriptRunner;

const SHADOWED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'self',
  'globalThis',
  'window',
  'document',
  'postMessage',
  'onmessage',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'indexedDB',
  'caches',
  'navigator',
  'location',
  'Function',
] as const;

async function runJavaScriptRobotScript(script: string, runId: number): Promise<void> {
  let commandWindowStart = Date.now();
  let commandCountInWindow = 0;
  let delayedSinceLastCheck = false;

  const assertQuotaAndActive = () => {
    if (runId !== activeRunId) {
      throw new Error('__SCRIPT_ABORTED__');
    }
    assertBatteryRemaining();
    const now = Date.now();
    if (now - commandWindowStart >= COMMAND_WINDOW_MS) {
      commandWindowStart = now;
      commandCountInWindow = 0;
    }
    commandCountInWindow += 1;
    if (commandCountInWindow > MAX_COMMANDS_PER_WINDOW) {
      throw new Error(
        `Execution quota exceeded: more than ${MAX_COMMANDS_PER_WINDOW} commands emitted within ${COMMAND_WINDOW_MS}ms. Add delay(ms) inside loops.`
      );
    }
  };

  const setServoAngle = (servoId: string, angle: number): void => {
    assertQuotaAndActive();
    if (typeof servoId !== 'string' || servoId.trim().length === 0) {
      throw new Error('setServoAngle(servoId, angle) requires a non-empty servoId string.');
    }
    if (typeof angle !== 'number' || !Number.isFinite(angle)) {
      throw new Error(`setServoAngle("${servoId}", angle) requires a finite number.`);
    }
    workerScope.postMessage({
      type: 'SET_SERVO_ANGLE',
      runId,
      servoTarget: normalizePinOrServoTarget(servoId),
      angleDeg: Math.max(MIN_SERVO_ANGLE_DEG, Math.min(MAX_SERVO_ANGLE_DEG, angle)),
    });
  };

  const delay = async (ms: number): Promise<void> => {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
      throw new Error('delay(ms) requires a non-negative finite number.');
    }
    delayedSinceLastCheck = true;
    await sleepWithAbort(ms, runId);
  };

  const log = (...args: unknown[]): void => {
    assertQuotaAndActive();
    postLog(runId, 'info', formatLogArgs(args));
  };

  const sandboxConsole = {
    log: (...args: unknown[]) => {
      assertQuotaAndActive();
      postLog(runId, 'info', formatLogArgs(args));
    },
    warn: (...args: unknown[]) => {
      assertQuotaAndActive();
      postLog(runId, 'warn', formatLogArgs(args));
    },
    error: (...args: unknown[]) => {
      assertQuotaAndActive();
      postLog(runId, 'error', formatLogArgs(args));
    },
  };

  const activeLoopPromises: Promise<void>[] = [];

  const loop = (fn: () => void | Promise<void>): Promise<void> => {
    if (typeof fn !== 'function') {
      return Promise.reject(new Error('loop(fn) requires a callback function.'));
    }
    const loopExecution = (async () => {
      let undelayedIterations = 0;
      while (runId === activeRunId) {
        assertBatteryRemaining();
        delayedSinceLastCheck = false;
        await fn();
        if (runId !== activeRunId) return;
        assertBatteryRemaining();

        if (delayedSinceLastCheck) {
          undelayedIterations = 0;
        } else {
          undelayedIterations += 1;
          if (undelayedIterations >= MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS) {
            throw new Error(
              `Execution quota exceeded: loop() executed ${MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS} iterations without calling delay(ms).`
            );
          }
          await sleepWithAbort(16, runId);
        }
      }
    })();
    activeLoopPromises.push(loopExecution);
    return loopExecution;
  };

  const getUltrasonicDistance = (): number => {
    const min = getMinSensorDistanceCm();
    return Number.isFinite(min) ? min : 999;
  };

  const waitUntilObstacleLess = async (thresholdCm: number): Promise<void> => {
    if (typeof thresholdCm !== 'number' || !Number.isFinite(thresholdCm) || thresholdCm < 0) {
      throw new Error('waitUntilObstacleLess(cm) requires a non-negative finite number.');
    }
    while (runId === activeRunId) {
      assertBatteryRemaining();
      if (getMinSensorDistanceCm() < thresholdCm) {
        return;
      }
      delayedSinceLastCheck = true;
      await sleepWithAbort(MIN_LOOP_FALLBACK_DELAY_MS, runId);
    }
  };

  const runner = new AsyncFunctionCtor(
    'setServoAngle',
    'delay',
    'loop',
    'log',
    'console',
    'getUltrasonicDistance',
    'waitUntilObstacleLess',
    ...SHADOWED_GLOBALS,
    `"use strict";\n${script}`
  );

  const undefinedShadows = new Array<undefined>(SHADOWED_GLOBALS.length).fill(undefined);
  await runner(
    setServoAngle,
    delay,
    loop,
    log,
    sandboxConsole,
    getUltrasonicDistance,
    waitUntilObstacleLess,
    ...undefinedShadows
  );
  if (activeLoopPromises.length > 0) {
    await Promise.all(activeLoopPromises);
  }
}

async function executeScript(runId: number, script: string): Promise<void> {
  clearTimers();
  activeRunId = runId;

  heartbeatTimerId = workerScope.setInterval(() => {
    if (runId === activeRunId) {
      workerScope.postMessage({ type: 'HEARTBEAT', runId });
    }
  }, HEARTBEAT_INTERVAL_MS);

  workerScope.postMessage({ type: 'HEARTBEAT', runId });

  try {
    if (isDeclarativeScript(script)) {
      await runDeclarativeScript(script, runId);
    } else {
      await runJavaScriptRobotScript(script, runId);
    }

    if (runId === activeRunId) {
      clearTimers();
      workerScope.postMessage({ type: 'COMPLETED', runId });
    }
  } catch (err: unknown) {
    if (runId !== activeRunId) {
      return;
    }
    if (err instanceof Error && err.message === '__SCRIPT_ABORTED__') {
      return;
    }
    clearTimers();
    const message = err instanceof Error ? err.message : String(err);
    workerScope.postMessage({ type: 'ERROR', runId, message });
  }
}

workerScope.onmessage = (event: WorkerMessageEvent): void => {
  const payload = event.data;
  if (payload.type === 'SENSOR_DATA') {
    latestSensorDistances = payload.sensorDistances ?? {};
    if (typeof payload.batteryLevel === 'number' && Number.isFinite(payload.batteryLevel)) {
      latestBatteryLevel = payload.batteryLevel;
      if (latestBatteryLevel <= 0 && activeSleepReject !== null) {
        const rejectForBattery = activeSleepReject;
        activeSleepReject = null;
        clearTimers();
        rejectForBattery(new Error('ERROR: BATTERY DEPLETED'));
      }
    }
    return;
  }
  if (payload.type === 'STOP') {
    activeRunId += 1;
    latestSensorDistances = {};
    latestBatteryLevel = 100;
    if (activeSleepReject !== null) {
      const rejectForStop = activeSleepReject;
      activeSleepReject = null;
      clearTimers();
      rejectForStop(new Error('__SCRIPT_ABORTED__'));
      return;
    }
    clearTimers();
    return;
  }
  if (payload.type === 'START') {
    latestSensorDistances = payload.sensorDistances ?? {};
    latestBatteryLevel =
      typeof payload.batteryLevel === 'number' && Number.isFinite(payload.batteryLevel)
        ? payload.batteryLevel
        : 100;
    void executeScript(payload.runId, payload.script);
  }
};
