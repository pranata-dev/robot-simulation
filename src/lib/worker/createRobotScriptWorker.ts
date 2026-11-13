/**
 * Portable inline Blob Web Worker factory for student robot control scripts.
 * Used as an automatic fallback when `new Worker(new URL(...), import.meta.url)` cannot be
 * resolved or loaded by a host LMS bundler across repositories.
 */
const INLINE_ROBOT_WORKER_SOURCE = `
"use strict";

var workerScope = globalThis;

var HEARTBEAT_INTERVAL_MS = 150;
var MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS = 50;
var MAX_COMMANDS_PER_WINDOW = 250;
var COMMAND_WINDOW_MS = 1000;
var MAX_DELAY_MS = 60000;
var MIN_SERVO_ANGLE_DEG = -60;
var MAX_SERVO_ANGLE_DEG = 60;
var DECLARATIVE_LINE_PATTERN = /^(PIN_\\d+|P\\d+|ESP_D\\d+)\\s*:\\s*(-?\\d+(?:\\.\\d+)?)$/i;

function normalizePinOrServoTarget(rawTarget) {
  var trimmed = String(rawTarget).trim();
  var pinMatch = trimmed.match(/^(?:PIN_|P)(\\d+)$/i);
  if (pinMatch) {
    return "P" + pinMatch[1];
  }
  return trimmed;
}

var activeRunId = 0;
var activeTimerId = null;
var heartbeatTimerId = null;

function clearTimers() {
  if (activeTimerId !== null) {
    workerScope.clearTimeout(activeTimerId);
    activeTimerId = null;
  }
  if (heartbeatTimerId !== null) {
    workerScope.clearInterval(heartbeatTimerId);
    heartbeatTimerId = null;
  }
}

function postLog(runId, level, message) {
  workerScope.postMessage({
    type: "LOG",
    runId: runId,
    level: level,
    message: message
  });
}

function formatLogArgs(args) {
  var parts = [];
  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (typeof arg === "string") {
      parts.push(arg);
    } else if (
      typeof arg === "number" ||
      typeof arg === "boolean" ||
      arg === null ||
      arg === undefined
    ) {
      parts.push(String(arg));
    } else {
      try {
        parts.push(JSON.stringify(arg));
      } catch (_err) {
        parts.push(Object.prototype.toString.call(arg));
      }
    }
  }
  return parts.join(" ");
}

function sleepWithAbort(ms, runId) {
  var safeMs = Number.isFinite(ms) ? Math.max(0, Math.min(MAX_DELAY_MS, ms)) : 0;
  return new Promise(function (resolve, reject) {
    if (runId !== activeRunId) {
      reject(new Error("__SCRIPT_ABORTED__"));
      return;
    }
    activeTimerId = workerScope.setTimeout(function () {
      activeTimerId = null;
      if (runId !== activeRunId) {
        reject(new Error("__SCRIPT_ABORTED__"));
        return;
      }
      resolve();
    }, safeMs);
  });
}

function stripDslComment(rawLine) {
  var hashIdx = rawLine.indexOf("#");
  var slashIdx = rawLine.indexOf("//");
  var cutoff = rawLine.length;
  if (hashIdx >= 0) cutoff = Math.min(cutoff, hashIdx);
  if (slashIdx >= 0) cutoff = Math.min(cutoff, slashIdx);
  return rawLine.slice(0, cutoff).trim();
}

function isDeclarativeScript(script) {
  var lines = script.split(/\\r?\\n/);
  var hasDirective = false;
  for (var i = 0; i < lines.length; i++) {
    var line = stripDslComment(lines[i]);
    if (!line) {
      continue;
    }
    var upper = line.toUpperCase();
    if (
      upper === "LOOP" ||
      /^DELAY\\s*:\\s*-?\\d+(?:\\.\\d+)?$/.test(upper) ||
      DECLARATIVE_LINE_PATTERN.test(line)
    ) {
      hasDirective = true;
      continue;
    }
    return false;
  }
  return hasDirective;
}

function parseDeclarativeFrames(script) {
  var rawLines = script.split(/\\r?\\n/);
  var frames = [];
  var pendingCommands = [];
  var shouldLoop = false;

  for (var i = 0; i < rawLines.length; i++) {
    var line = stripDslComment(rawLines[i]);
    if (!line) continue;

    var upper = line.toUpperCase();
    if (upper === "LOOP") {
      shouldLoop = true;
      continue;
    }

    if (upper.indexOf("DELAY") === 0) {
      var colonIdx = line.indexOf(":");
      var ms = colonIdx >= 0 ? Number(line.slice(colonIdx + 1).trim()) : NaN;
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error('Invalid DELAY value in line "' + line + '".');
      }
      frames.push({ commands: pendingCommands, delayMs: ms });
      pendingCommands = [];
      continue;
    }

    var match = line.match(DECLARATIVE_LINE_PATTERN);
    if (match) {
      var servoTarget = normalizePinOrServoTarget(match[1].toUpperCase());
      var angleDeg = Math.max(
        MIN_SERVO_ANGLE_DEG,
        Math.min(MAX_SERVO_ANGLE_DEG, Number(match[2]))
      );
      pendingCommands.push({ servoTarget: servoTarget, angleDeg: angleDeg });
    }
  }

  if (pendingCommands.length > 0) {
    frames.push({ commands: pendingCommands, delayMs: null });
  }

  return { frames: frames, shouldLoop: shouldLoop };
}

async function runDeclarativeScript(script, runId) {
  var parsed = parseDeclarativeFrames(script);
  var frames = parsed.frames;
  var shouldLoop = parsed.shouldLoop;
  var iterationsWithoutDelay = 0;
  var isRunning = true;

  while (isRunning && runId === activeRunId) {
    var delayedThisPass = false;

    for (var i = 0; i < frames.length; i++) {
      if (!isRunning || runId !== activeRunId) return;
      var frame = frames[i];

      if (frame.commands.length > 0) {
        workerScope.postMessage({
          type: "SET_SERVO_BATCH",
          runId: runId,
          commands: frame.commands
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
          "Execution quota exceeded: LOOP repeated " +
            MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS +
            " times without DELAY."
        );
      }
      await sleepWithAbort(16, runId);
    }
  }
}

var AsyncFunctionCtor = Object.getPrototypeOf(async function noop() {}).constructor;

var SHADOWED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "importScripts",
  "self",
  "globalThis",
  "window",
  "document",
  "postMessage",
  "onmessage",
  "Worker",
  "SharedWorker",
  "BroadcastChannel",
  "indexedDB",
  "caches",
  "navigator",
  "location",
  "Function",
  "eval"
];

async function runJavaScriptRobotScript(script, runId) {
  var commandWindowStart = Date.now();
  var commandCountInWindow = 0;
  var delayedSinceLastCheck = false;

  function assertQuotaAndActive() {
    if (runId !== activeRunId) {
      throw new Error("__SCRIPT_ABORTED__");
    }
    var now = Date.now();
    if (now - commandWindowStart >= COMMAND_WINDOW_MS) {
      commandWindowStart = now;
      commandCountInWindow = 0;
    }
    commandCountInWindow += 1;
    if (commandCountInWindow > MAX_COMMANDS_PER_WINDOW) {
      throw new Error(
        "Execution quota exceeded: more than " +
          MAX_COMMANDS_PER_WINDOW +
          " commands emitted within " +
          COMMAND_WINDOW_MS +
          "ms. Add delay(ms) inside loops."
      );
    }
  }

  function setServoAngle(servoId, angle) {
    assertQuotaAndActive();
    if (typeof servoId !== "string" || servoId.trim().length === 0) {
      throw new Error("setServoAngle(servoId, angle) requires a non-empty servoId string.");
    }
    if (typeof angle !== "number" || !Number.isFinite(angle)) {
      throw new Error('setServoAngle("' + servoId + '", angle) requires a finite number.');
    }
    workerScope.postMessage({
      type: "SET_SERVO_ANGLE",
      runId: runId,
      servoTarget: normalizePinOrServoTarget(servoId),
      angleDeg: Math.max(MIN_SERVO_ANGLE_DEG, Math.min(MAX_SERVO_ANGLE_DEG, angle))
    });
  }

  async function delay(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
      throw new Error("delay(ms) requires a non-negative finite number.");
    }
    delayedSinceLastCheck = true;
    await sleepWithAbort(ms, runId);
  }

  function log() {
    assertQuotaAndActive();
    postLog(runId, "info", formatLogArgs(arguments));
  }

  var sandboxConsole = {
    log: function () {
      assertQuotaAndActive();
      postLog(runId, "info", formatLogArgs(arguments));
    },
    warn: function () {
      assertQuotaAndActive();
      postLog(runId, "warn", formatLogArgs(arguments));
    },
    error: function () {
      assertQuotaAndActive();
      postLog(runId, "error", formatLogArgs(arguments));
    }
  };

  var activeLoopPromises = [];

  function loop(fn) {
    if (typeof fn !== "function") {
      return Promise.reject(new Error("loop(fn) requires a callback function."));
    }
    var loopExecution = (async function () {
      var undelayedIterations = 0;
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
              "Execution quota exceeded: loop() executed " +
                MAX_CONSECUTIVE_UNDELAYED_LOOP_ITERATIONS +
                " iterations without calling delay(ms)."
            );
          }
          await sleepWithAbort(16, runId);
        }
      }
    })();
    activeLoopPromises.push(loopExecution);
    return loopExecution;
  }

  var ctorArgs = ["setServoAngle", "delay", "loop", "log", "console"]
    .concat(SHADOWED_GLOBALS)
    .concat(['"use strict";\\n' + script]);

  var runner = AsyncFunctionCtor.apply(null, ctorArgs);
  var invokeArgs = [setServoAngle, delay, loop, log, sandboxConsole];
  for (var s = 0; s < SHADOWED_GLOBALS.length; s++) {
    invokeArgs.push(undefined);
  }

  await runner.apply(null, invokeArgs);
  if (activeLoopPromises.length > 0) {
    await Promise.all(activeLoopPromises);
  }
}

async function executeScript(runId, script) {
  clearTimers();
  activeRunId = runId;

  heartbeatTimerId = workerScope.setInterval(function () {
    if (runId === activeRunId) {
      workerScope.postMessage({ type: "HEARTBEAT", runId: runId });
    }
  }, HEARTBEAT_INTERVAL_MS);

  workerScope.postMessage({ type: "HEARTBEAT", runId: runId });

  try {
    if (isDeclarativeScript(script)) {
      await runDeclarativeScript(script, runId);
    } else {
      await runJavaScriptRobotScript(script, runId);
    }

    if (runId === activeRunId) {
      clearTimers();
      workerScope.postMessage({ type: "COMPLETED", runId: runId });
    }
  } catch (err) {
    if (runId !== activeRunId) {
      return;
    }
    if (err instanceof Error && err.message === "__SCRIPT_ABORTED__") {
      return;
    }
    clearTimers();
    var message = err instanceof Error ? err.message : String(err);
    workerScope.postMessage({ type: "ERROR", runId: runId, message: message });
  }
}

workerScope.onmessage = function (event) {
  var payload = event.data;
  if (payload.type === "STOP") {
    activeRunId += 1;
    clearTimers();
    return;
  }
  if (payload.type === "START") {
    executeScript(payload.runId, payload.script);
  }
};
`;

export interface InlineWorkerHandle {
  worker: Worker;
  blobUrl: string;
}

/**
 * Instantiates a self-contained Web Worker from an inline Blob URL so script execution works
 * reliably across Next.js / Vite / Webpack LMS host environments without separate worker chunk resolution.
 */
export function createInlineRobotScriptWorker(): InlineWorkerHandle {
  const blob = new Blob([INLINE_ROBOT_WORKER_SOURCE], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const worker = new Worker(blobUrl);
    return { worker, blobUrl };
  } catch (err: unknown) {
    URL.revokeObjectURL(blobUrl);
    throw err;
  }
}

