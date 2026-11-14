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
var MIN_LOOP_FALLBACK_DELAY_MS = 50;
var MAX_COMMANDS_PER_WINDOW = 250;
var COMMAND_WINDOW_MS = 1000;
var MAX_DELAY_MS = 60000;
var MIN_SERVO_ANGLE_DEG = -60;
var MAX_SERVO_ANGLE_DEG = 60;
var DECLARATIVE_LINE_PATTERN = /^(PIN_\\d+|P\\d+|ESP_D\\d+|D\\d+|\\d+)\\s*:\\s*(-?\\d+(?:\\.\\d+)?)$/i;
var OBSTACLE_WAIT_PATTERN = /^WAIT_UNTIL_OBSTACLE_LESS\\s*:\\s*(-?\\d+(?:\\.\\d+)?)$/i;
var IF_OBSTACLE_PATTERN = /^IF_OBSTACLE_LESS_THAN\\s*:\\s*(-?\\d+(?:\\.\\d+)?)$/i;

function normalizePinOrServoTarget(rawTarget) {
  var trimmed = String(rawTarget).trim();
  var pinMatch = trimmed.match(/^(PIN_\\d+|P\\d+|ESP_D\\d+|D\\d+|\\d+)$/i);
  if (pinMatch) {
    return pinMatch[1].toUpperCase();
  }
  return trimmed;
}

var activeRunId = 0;
var activeTimerId = null;
var heartbeatTimerId = null;
var activeSleepReject = null;
var latestSensorDistances = {};
var latestBatteryLevel = 100;

function assertBatteryRemaining() {
  if (latestBatteryLevel <= 0) {
    throw new Error("ERROR: BATTERY DEPLETED");
  }
}

function getMinSensorDistanceCm() {
  var min = Infinity;
  var keys = Object.keys(latestSensorDistances);
  for (var i = 0; i < keys.length; i++) {
    var val = latestSensorDistances[keys[i]];
    if (typeof val === "number" && Number.isFinite(val) && val < min) {
      min = val;
    }
  }
  return min;
}

function clearTimers() {
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
    if (latestBatteryLevel <= 0) {
      reject(new Error("ERROR: BATTERY DEPLETED"));
      return;
    }
    activeSleepReject = reject;
    activeTimerId = workerScope.setTimeout(function () {
      activeTimerId = null;
      activeSleepReject = null;
      if (runId !== activeRunId) {
        reject(new Error("__SCRIPT_ABORTED__"));
        return;
      }
      if (latestBatteryLevel <= 0) {
        reject(new Error("ERROR: BATTERY DEPLETED"));
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
    if (/[=(){};]|=>|\\b(const|let|var|function|async|await|for|while|if)\\b/.test(line)) {
      return false;
    }
    var upper = line.toUpperCase();
    if (
      upper === "LOOP" ||
      upper === "END" ||
      upper === "ELSE" ||
      upper === "END_IF" ||
      /^DELAY\\s*:/i.test(line) ||
      OBSTACLE_WAIT_PATTERN.test(line) ||
      IF_OBSTACLE_PATTERN.test(line) ||
      DECLARATIVE_LINE_PATTERN.test(line)
    ) {
      hasDirective = true;
    }
  }
  return hasDirective;
}

function parseDeclarativeCommands(script) {
  var rawLines = script.split(/\\r?\\n/);
  var commands = [];
  var ifStack = [];
  var hasLoop = false;

  for (var i = 0; i < rawLines.length; i++) {
    var line = stripDslComment(rawLines[i]);
    if (!line) continue;

    var upper = line.toUpperCase();
    if (upper === "LOOP") {
      hasLoop = true;
      commands.push({ type: "LOOP" });
      continue;
    }

    if (upper === "END") {
      continue;
    }

    var ifMatch = line.match(IF_OBSTACLE_PATTERN);
    if (ifMatch) {
      var ifThresholdCm = Number(ifMatch[1]);
      if (!Number.isFinite(ifThresholdCm) || ifThresholdCm < 0) {
        throw new Error("Invalid obstacle distance threshold on line " + (i + 1) + ': "' + line + '".');
      }
      var ifIndex = commands.length;
      commands.push({
        type: "IF_OBSTACLE_LESS_THAN",
        thresholdCm: ifThresholdCm,
        falseJumpIndex: -1
      });
      ifStack.push({ ifIndex: ifIndex, elseIndex: null, lineNumber: i + 1 });
      continue;
    }

    if (upper === "ELSE") {
      var topFrame = ifStack.length > 0 ? ifStack[ifStack.length - 1] : null;
      if (!topFrame) {
        throw new Error("Unexpected ELSE without matching IF_OBSTACLE_LESS_THAN on line " + (i + 1) + ".");
      }
      if (topFrame.elseIndex !== null) {
        throw new Error("Duplicate ELSE on line " + (i + 1) + " for IF block starting on line " + topFrame.lineNumber + ".");
      }
      var elseIndex = commands.length;
      commands.push({ type: "ELSE", endIfIndex: -1 });
      topFrame.elseIndex = elseIndex;
      commands[topFrame.ifIndex].falseJumpIndex = elseIndex + 1;
      continue;
    }

    if (upper === "END_IF") {
      var poppedFrame = ifStack.pop();
      if (!poppedFrame) {
        throw new Error("Unexpected END_IF without matching IF_OBSTACLE_LESS_THAN on line " + (i + 1) + ".");
      }
      var endIfIndex = commands.length;
      commands.push({ type: "END_IF" });
      if (poppedFrame.elseIndex !== null) {
        commands[poppedFrame.elseIndex].endIfIndex = endIfIndex;
      } else {
        commands[poppedFrame.ifIndex].falseJumpIndex = endIfIndex + 1;
      }
      continue;
    }

    if (/^DELAY\\s*:/i.test(line)) {
      var colonIdx = line.indexOf(":");
      var rawValue = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
      var ms = rawValue ? Number(rawValue) : NaN;
      if (!Number.isFinite(ms) || ms < 0 || ms > MAX_DELAY_MS) {
        throw new Error("Invalid DELAY value on line " + (i + 1) + ': "' + line + '".');
      }
      commands.push({ type: "DELAY", ms: ms });
      continue;
    }

    var obstacleMatch = line.match(OBSTACLE_WAIT_PATTERN);
    if (obstacleMatch) {
      var thresholdCm = Number(obstacleMatch[1]);
      if (!Number.isFinite(thresholdCm) || thresholdCm < 0) {
        throw new Error("Invalid obstacle distance threshold on line " + (i + 1) + ': "' + line + '".');
      }
      commands.push({ type: "WAIT_UNTIL_OBSTACLE_LESS", thresholdCm: thresholdCm });
      continue;
    }

    var match = line.match(DECLARATIVE_LINE_PATTERN);
    if (match) {
      var pin = normalizePinOrServoTarget(match[1].toUpperCase());
      var parsedAngle = Number(match[2]);
      if (!Number.isFinite(parsedAngle)) {
        throw new Error("Invalid servo angle on line " + (i + 1) + ': "' + line + '".');
      }
      var angle = Math.max(
        MIN_SERVO_ANGLE_DEG,
        Math.min(MAX_SERVO_ANGLE_DEG, parsedAngle)
      );
      commands.push({ type: "PIN", pin: pin, angle: angle });
      continue;
    }

    throw new Error("Syntax error in DSL script on line " + (i + 1) + ': "' + line + '".');
  }

  if (ifStack.length > 0) {
    var unclosed = ifStack[ifStack.length - 1];
    throw new Error("Missing END_IF for IF_OBSTACLE_LESS_THAN starting on line " + unclosed.lineNumber + ".");
  }

  return { commands: commands, hasLoop: hasLoop };
}

function formatPinStateSummary(pinStates) {
  var keys = Object.keys(pinStates);
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    parts.push(keys[i] + ": " + pinStates[keys[i]] + "deg");
  }
  return parts.join(", ");
}

async function runDeclarativeScript(script, runId) {
  var parsed = parseDeclarativeCommands(script);
  var commands = parsed.commands;
  var hasLoop = parsed.hasLoop;
  var currentPinStates = {};
  var lastBranchOutcomeByPc = {};
  var lastLoggedSummary = "";
  var isRunning = true;

  function flushBatch(batch, forceLog) {
    assertBatteryRemaining();
    if (batch.length === 0) return;

    workerScope.postMessage({
      type: "SET_SERVO_BATCH",
      runId: runId,
      commands: batch
    });

    for (var j = 0; j < batch.length; j++) {
      currentPinStates[batch[j].servoTarget] = batch[j].angleDeg;
    }

    var summary = formatPinStateSummary(currentPinStates);
    if (forceLog || summary !== lastLoggedSummary) {
      lastLoggedSummary = summary;
      postLog(runId, "info", "Pins -> " + summary);
    }
  }

  while (isRunning && runId === activeRunId) {
    assertBatteryRemaining();
    var pendingBatch = [];
    var totalDelayMsThisPass = 0;
    var pc = 0;

    while (pc < commands.length) {
      if (!isRunning || runId !== activeRunId) return;
      assertBatteryRemaining();
      var cmd = commands[pc];

      if (cmd.type === "PIN") {
        pendingBatch.push({ servoTarget: cmd.pin, angleDeg: cmd.angle });
        pc += 1;
        continue;
      }

      if (cmd.type === "DELAY") {
        flushBatch(pendingBatch, cmd.ms > 0);
        pendingBatch = [];
        totalDelayMsThisPass += cmd.ms;
        await sleepWithAbort(cmd.ms, runId);
        pc += 1;
        continue;
      }

      if (cmd.type === "IF_OBSTACLE_LESS_THAN") {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
        var branchMin = getMinSensorDistanceCm();
        var isTriggered = branchMin < cmd.thresholdCm;
        if (lastBranchOutcomeByPc[pc] !== isTriggered) {
          lastBranchOutcomeByPc[pc] = isTriggered;
          var distLabel = Number.isFinite(branchMin) ? branchMin.toFixed(1) + " cm" : "clear";
          postLog(
            runId,
            "info",
            isTriggered
              ? "Obstacle " + distLabel + " < " + cmd.thresholdCm + " cm -> avoiding (IF branch)"
              : "Path " + distLabel + " >= " + cmd.thresholdCm + " cm -> forward gait (ELSE branch)"
          );
        }
        pc = isTriggered ? pc + 1 : cmd.falseJumpIndex;
        continue;
      }

      if (cmd.type === "ELSE") {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
        pc = cmd.endIfIndex + 1;
        continue;
      }

      if (cmd.type === "END_IF") {
        flushBatch(pendingBatch, false);
        pendingBatch = [];
        pc += 1;
        continue;
      }

      if (cmd.type === "WAIT_UNTIL_OBSTACLE_LESS") {
        flushBatch(pendingBatch, true);
        pendingBatch = [];
        postLog(runId, "info", "Waiting until obstacle < " + cmd.thresholdCm + " cm...");
        while (isRunning && runId === activeRunId) {
          assertBatteryRemaining();
          var currentMin = getMinSensorDistanceCm();
          if (currentMin < cmd.thresholdCm) {
            postLog(
              runId,
              "info",
              "Obstacle detected at " +
                currentMin.toFixed(1) +
                " cm (< " +
                cmd.thresholdCm +
                " cm) — continuing."
            );
            break;
          }
          totalDelayMsThisPass += MIN_LOOP_FALLBACK_DELAY_MS;
          await sleepWithAbort(MIN_LOOP_FALLBACK_DELAY_MS, runId);
        }
        pc += 1;
        continue;
      }

      if (cmd.type === "LOOP") {
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
  "Function"
];

async function runJavaScriptRobotScript(script, runId) {
  var commandWindowStart = Date.now();
  var commandCountInWindow = 0;
  var delayedSinceLastCheck = false;

  function assertQuotaAndActive() {
    if (runId !== activeRunId) {
      throw new Error("__SCRIPT_ABORTED__");
    }
    assertBatteryRemaining();
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

  function getUltrasonicDistance() {
    var min = getMinSensorDistanceCm();
    return Number.isFinite(min) ? min : 999;
  }

  async function waitUntilObstacleLess(thresholdCm) {
    if (typeof thresholdCm !== "number" || !Number.isFinite(thresholdCm) || thresholdCm < 0) {
      throw new Error("waitUntilObstacleLess(cm) requires a non-negative finite number.");
    }
    while (runId === activeRunId) {
      assertBatteryRemaining();
      if (getMinSensorDistanceCm() < thresholdCm) {
        return;
      }
      delayedSinceLastCheck = true;
      await sleepWithAbort(MIN_LOOP_FALLBACK_DELAY_MS, runId);
    }
  }

  var ctorArgs = [
    "setServoAngle",
    "delay",
    "loop",
    "log",
    "console",
    "getUltrasonicDistance",
    "waitUntilObstacleLess"
  ]
    .concat(SHADOWED_GLOBALS)
    .concat(['"use strict";\\n' + script]);

  var runner = AsyncFunctionCtor.apply(null, ctorArgs);
  var invokeArgs = [
    setServoAngle,
    delay,
    loop,
    log,
    sandboxConsole,
    getUltrasonicDistance,
    waitUntilObstacleLess
  ];
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
  if (payload.type === "SENSOR_DATA") {
    latestSensorDistances = payload.sensorDistances || {};
    if (typeof payload.batteryLevel === "number" && Number.isFinite(payload.batteryLevel)) {
      latestBatteryLevel = payload.batteryLevel;
      if (latestBatteryLevel <= 0 && activeSleepReject !== null) {
        var rejectForBattery = activeSleepReject;
        activeSleepReject = null;
        clearTimers();
        rejectForBattery(new Error("ERROR: BATTERY DEPLETED"));
      }
    }
    return;
  }
  if (payload.type === "STOP") {
    activeRunId += 1;
    latestSensorDistances = {};
    latestBatteryLevel = 100;
    if (activeSleepReject !== null) {
      var rejectForStop = activeSleepReject;
      activeSleepReject = null;
      clearTimers();
      rejectForStop(new Error("__SCRIPT_ABORTED__"));
      return;
    }
    clearTimers();
    return;
  }
  if (payload.type === "START") {
    latestSensorDistances = payload.sensorDistances || {};
    latestBatteryLevel =
      typeof payload.batteryLevel === "number" && Number.isFinite(payload.batteryLevel)
        ? payload.batteryLevel
        : 100;
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

