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
const MAX_COMMANDS_PER_WINDOW = 250;
const COMMAND_WINDOW_MS = 1000;
const MAX_DELAY_MS = 60_000;
const MIN_SERVO_ANGLE_DEG = -60;
const MAX_SERVO_ANGLE_DEG = 60;
const DECLARATIVE_LINE_PATTERN = /^(PIN_\d+|P\d+|ESP_D\d+)\s*:\s*(-?\d+(?:\.\d+)?)$/i;

function normalizePinOrServoTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  const pinMatch = trimmed.match(/^(?:PIN_|P)(\d+)$/i);
  if (pinMatch) {
    return `P${pinMatch[1]}`;
  }
  return trimmed;
}

interface DslStepCommand {
  servoTarget: string;
  angleDeg: number;
}

interface DslStepFrame {
  commands: DslStepCommand[];
  delayMs: number | null;
}

let activeRunId = 0;
let activeTimerId: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimerId: ReturnType<typeof setInterval> | null = null;

function clearTimers(): void {
  if (activeTimerId !== null) {
    workerScope.clearTimeout(activeTimerId);
    activeTimerId = null;
  }
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
    activeTimerId = workerScope.setTimeout(() => {
      activeTimerId = null;
      if (runId !== activeRunId) {
        reject(new Error('__SCRIPT_ABORTED__'));
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
    const upper = line.toUpperCase();
    if (upper === 'LOOP' || /^DELAY\s*:\s*-?\d+(?:\.\d+)?$/.test(upper) || DECLARATIVE_LINE_PATTERN.test(line)) {
      hasDirective = true;
      continue;
    }
    return false;
  }
  return hasDirective;
}

function parseDeclarativeFrames(script: string): {
  frames: DslStepFrame[];
  shouldLoop: boolean;
} {
  const rawLines = script.split(/\r?\n/);
  const frames: DslStepFrame[] = [];
  let pendingCommands: DslStepCommand[] = [];
  let shouldLoop = false;

  for (const rawLine of rawLines) {
    const line = stripDslComment(rawLine);
    if (!line) continue;

    const upper = line.toUpperCase();
    if (upper === 'LOOP') {
      shouldLoop = true;
      continue;
    }

    if (upper.startsWith('DELAY')) {
      const colonIdx = line.indexOf(':');
      const ms = colonIdx >= 0 ? Number(line.slice(colonIdx + 1).trim()) : Number.NaN;
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error(`Invalid DELAY value in line "${line}".`);
      }
      frames.push({ commands: pendingCommands, delayMs: ms });
      pendingCommands = [];
      continue;
    }

    const match = line.match(DECLARATIVE_LINE_PATTERN);
    if (match) {
      const servoTarget = normalizePinOrServoTarget(match[1].toUpperCase());
      const angleDeg = Math.max(
        MIN_SERVO_ANGLE_DEG,
        Math.min(MAX_SERVO_ANGLE_DEG, Number(match[2])),
      );
      pendingCommands.push({ servoTarget, angleDeg });
    }
  }

  if (pendingCommands.length > 0) {
    frames.push({ commands: pendingCommands, delayMs: null });
  }

  return { frames, shouldLoop };
}

async function runDeclarativeScript(script: string, runId: number): Promise<void> {
  const { frames, shouldLoop } = parseDeclarativeFrames(script);
  let iterationsWithoutDelay = 0;
  let isRunning = true;

  while (isRunning && runId === activeRunId) {
    let delayedThisPass = false;

    for (const frame of frames) {
      if (!isRunning || runId !== activeRunId) return;

      if (frame.commands.length > 0) {
        workerScope.postMessage({
          type: 'SET_SERVO_BATCH',
          runId,
          commands: frame.commands,
        });
      }

      if (frame.delayMs !== null) {
        delayedThisPass = true;
        await sleepWithAbort(frame.delayMs, runId);
      }
    }

    if (!shouldLoop) {
      isRunning = false;
      break;
    }

    if (delayedThisPass) {
      iterationsWithoutDelay = 0;
    } else {
      iterationsWithoutDelay += 1;
      if (iterationsWithoutDelay >= MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS) {
        throw new Error(
          `Execution quota exceeded: LOOP repeated ${MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS} times without DELAY.`
        );
      }
      // Cooperative frame yield when LOOP has no explicit DELAY
      await sleepWithAbort(16, runId);
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
  'eval',
] as const;

async function runJavaScriptRobotScript(script: string, runId: number): Promise<void> {
  let commandWindowStart = Date.now();
  let commandCountInWindow = 0;
  let delayedSinceLastCheck = false;

  const assertQuotaAndActive = () => {
    if (runId !== activeRunId) {
      throw new Error('__SCRIPT_ABORTED__');
    }
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
        delayedSinceLastCheck = false;
        await fn();
        if (runId !== activeRunId) return;

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

  const runner = new AsyncFunctionCtor(
    'setServoAngle',
    'delay',
    'loop',
    'log',
    'console',
    ...SHADOWED_GLOBALS,
    `"use strict";\n${script}`
  );

  const undefinedShadows = new Array<undefined>(SHADOWED_GLOBALS.length).fill(undefined);
  await runner(setServoAngle, delay, loop, log, sandboxConsole, ...undefinedShadows);
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
  if (payload.type === 'STOP') {
    activeRunId += 1;
    clearTimers();
    return;
  }
  if (payload.type === 'START') {
    void executeScript(payload.runId, payload.script);
  }
};
