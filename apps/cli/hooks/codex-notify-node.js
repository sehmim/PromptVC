#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

function execGit(args, cwd) {
  const result = childProcess.spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return '';
  return (result.stdout || '').trimEnd();
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeReadJson(filePath, fallback) {
  const raw = safeReadFile(filePath);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWriteFile(filePath, contents) {
  fs.writeFileSync(filePath, contents);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getTimestampUtcIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`
  );
}

function readPayloadFromStdin() {
  if (process.stdin.isTTY) return null;
  try {
    const data = fs.readFileSync(0, 'utf8').trim();
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function getPayloadString(payload, keys) {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of keys) {
    const direct = payload[key];
    if (typeof direct === 'string' && direct.length > 0) return direct;
    const nested = payload?.payload?.[key];
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return '';
}

function listRolloutFilesRecursively(baseDir) {
  const result = [];
  if (!fs.existsSync(baseDir)) return result;

  const stack = [baseDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function findLatestSessionFile() {
  const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
  const candidates = listRolloutFilesRecursively(sessionsRoot);
  let latest = null;
  let latestMtime = -1;

  for (const filePath of candidates) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latest = filePath;
      }
    } catch {
      // ignore
    }
  }

  return latest;
}

function readFirstJsonLine(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const chunkSize = 64 * 1024;
    const maxBytes = 1024 * 1024;
    let totalRead = 0;
    let buffer = '';
    while (totalRead < maxBytes) {
      const chunk = Buffer.alloc(chunkSize);
      const bytesRead = fs.readSync(fd, chunk, 0, chunk.length, totalRead);
      if (bytesRead <= 0) break;
      totalRead += bytesRead;
      buffer += chunk.slice(0, bytesRead).toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        buffer = buffer.slice(0, newlineIndex);
        break;
      }
    }
    if (!buffer.trim()) return null;
    return JSON.parse(buffer);
  } catch {
    return null;
  } finally {
    if (typeof fd === 'number') {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

function getSessionCwd(filePath) {
  const firstItem = readFirstJsonLine(filePath);
  if (!firstItem || firstItem.type !== 'session_meta') return null;
  const cwd = firstItem?.payload?.cwd;
  return typeof cwd === 'string' ? cwd : null;
}

function sessionMatchesRepo(fileCwd, repoRoot) {
  if (!fileCwd) return false;
  const normalizedRepo = path.resolve(repoRoot);
  let normalizedCwd;
  try {
    normalizedCwd = path.resolve(fileCwd);
  } catch {
    normalizedCwd = fileCwd;
  }
  return normalizedCwd === normalizedRepo || normalizedCwd.startsWith(`${normalizedRepo}${path.sep}`);
}

function findLatestSessionFileForRepo(repoRoot) {
  const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
  const candidates = listRolloutFilesRecursively(sessionsRoot);
  const withStats = [];

  for (const filePath of candidates) {
    try {
      const stat = fs.statSync(filePath);
      withStats.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      continue;
    }
  }

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { filePath } of withStats) {
    const cwd = getSessionCwd(filePath);
    if (sessionMatchesRepo(cwd, repoRoot)) {
      return { filePath, cwd };
    }
  }

  return null;
}

function extractMessageText(item) {
  const payload = item?.payload;
  const content = payload?.content;

  if (typeof content === 'string') {
    return content.trimEnd();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts = [];
  for (const block of content) {
    if (!block) continue;
    if (typeof block === 'string') {
      parts.push(block);
      continue;
    }
    if (typeof block.text === 'string') {
      parts.push(block.text);
      continue;
    }
    if (typeof block.value === 'string') {
      parts.push(block.value);
    }
  }

  return parts.join('\n').trimEnd();
}

function extractPromptTurnsFromSessionJsonl(sessionFilePath) {
  const raw = safeReadFile(sessionFilePath);
  if (!raw) return [];

  const turns = [];
  const lines = raw.split('\n');
  let currentTurn = null;

  for (const line of lines) {
    if (!line) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }

    if (item?.type !== 'response_item') continue;
    const role = item?.payload?.role;
    if (role !== 'user' && role !== 'assistant') continue;

    const text = extractMessageText(item);
    if (!text) continue;

    if (role === 'user') {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = { prompt: text, response: '' };
      continue;
    }

    if (role === 'assistant' && currentTurn) {
      currentTurn.response = currentTurn.response
        ? `${currentTurn.response}\n\n${text}`
        : text;
    }
  }

  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
}

function stripInstructionBlocks(prompt) {
  if (typeof prompt !== 'string') return '';
  let cleaned = prompt.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/^# AGENTS\.md instructions[^\n]*\n+/i, '');
  cleaned = cleaned.replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>\s*/g, '');
  cleaned = cleaned.replace(/<environment_context>[\s\S]*?<\/environment_context>\s*/g, '');
  cleaned = cleaned.replace(/<INSTRUCTIONS>[\s\S]*$/g, '');
  cleaned = cleaned.replace(/<environment_context>[\s\S]*$/g, '');
  return cleaned.trim();
}

function sanitizePromptTurns(turns) {
  return turns
    .map((turn) => {
      const prompt = stripInstructionBlocks(turn.prompt);
      if (!prompt) return null;
      const response = typeof turn.response === 'string' ? turn.response.trim() : '';
      return { prompt, response };
    })
    .filter((turn) => turn && turn.prompt.length > 0);
}

function uniq(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function mergeFiles(existing, incoming) {
  return uniq([...(existing || []), ...(incoming || [])]);
}

function responseSnippetForChanges(perPromptChanges) {
  const count = perPromptChanges?.length || 0;
  return `Interactive session: ${count} prompt${count === 1 ? '' : 's'}`;
}

function playNotifySound(repoRoot) {
  const settingsFile = path.join(repoRoot, '.promptvc', 'settings.json');
  let soundEnabled = true; // default

  try {
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (settings.notifySoundEnabled === false) soundEnabled = false;
    }
  } catch {
    // ignore
  }

  if (!soundEnabled) return;

  // Locate sound file
  // Script is likely at apps/cli/hooks/codex-notify-node.js
  // Sound is at apps/cli/assets/notify.mp3
  const scriptDir = __dirname;
  // Try relative to the script location (in dev or installed package)
  let soundPath = path.join(scriptDir, '..', 'assets', 'notify.mp3');

  if (!fs.existsSync(soundPath)) {
    // Fallback for different directory structures (e.g. dist/)
    soundPath = path.join(scriptDir, '..', '..', 'assets', 'notify.mp3');
  }

  if (!fs.existsSync(soundPath)) return;

  const players = [
    { cmd: 'afplay', args: [soundPath] },
    { cmd: 'paplay', args: [soundPath] },
    { cmd: 'aplay', args: [soundPath] },
    { cmd: 'play', args: [soundPath] }
  ];

  for (const player of players) {
    try {
      // Check if command exists
      childProcess.execSync(`command -v ${player.cmd}`, { stdio: 'ignore' });
      // Play sound synchronously to avoid race condition on exit
      childProcess.spawnSync(player.cmd, player.args, {
        stdio: 'ignore'
      });
      return;
    } catch {
      continue;
    }
  }
}


function main() {
  const debugLog = (msg) => {
    try {
      const ts = new Date().toISOString();
      fs.appendFileSync('/tmp/pvc-notify.log', `[${ts}] ${msg}\n`);
    } catch (e) { }
  };

  const payload = readPayloadFromStdin();
  if (payload) {
    const preview = JSON.stringify(payload);
    debugLog(`Payload: ${preview.length > 2000 ? `${preview.slice(0, 2000)}...` : preview}`);
  } else {
    debugLog('No payload on stdin.');
  }

  const payloadCwd = getPayloadString(payload, ['cwd', 'workdir', 'repo_root', 'repoRoot']);
  const payloadSessionFile = getPayloadString(payload, [
    'session_file',
    'sessionFile',
    'session_path',
    'sessionPath',
    'session',
    'file'
  ]);

  const hookCwd = process.cwd();
  debugLog(`Hook cwd: ${hookCwd}`);

  // Resolve repo root, even if hook is invoked outside the repo.
  let repoRoot = execGit(['rev-parse', '--show-toplevel'], hookCwd);
  let repoRootSource = repoRoot ? 'cwd' : 'unknown';

  if (!repoRoot && payloadCwd) {
    const resolved = execGit(['rev-parse', '--show-toplevel'], payloadCwd);
    if (resolved) {
      repoRoot = resolved;
      repoRootSource = 'payload_cwd';
      debugLog(`Resolved repo from payload cwd: ${payloadCwd}`);
    }
  }

  if (!repoRoot) {
    const latestAnySessionFile = findLatestSessionFile();
    if (latestAnySessionFile) {
      const sessionCwd = getSessionCwd(latestAnySessionFile);
      if (sessionCwd) {
        const resolved = execGit(['rev-parse', '--show-toplevel'], sessionCwd);
        if (resolved) {
          repoRoot = resolved;
          repoRootSource = 'session_cwd';
          debugLog(`Resolved repo from session cwd: ${sessionCwd}`);
        }
      }
    }
  }

  if (!repoRoot) {
    debugLog('No git repo resolved for hook.');
    process.exit(0);
  }

  debugLog(`Repo root: ${repoRoot} (source: ${repoRootSource})`);

  const promptvcDir = path.join(repoRoot, '.promptvc');
  const sessionsFile = path.join(promptvcDir, 'sessions.json');

  debugLog('Starting codex-notify-node.js');

  const lastPromptFile = path.join(promptvcDir, 'last_prompt_count');
  const lastSessionFile = path.join(promptvcDir, 'last_session_file');
  const lastGitStateFile = path.join(promptvcDir, 'last_git_state.json');
  const settingsFile = path.join(promptvcDir, 'settings.json');

  ensureDir(promptvcDir);
  if (!fs.existsSync(sessionsFile)) safeWriteFile(sessionsFile, '[]');

  // Setup exit handler to play sound (mimics trap EXIT)
  process.on('exit', (code) => {
    debugLog(`Exiting with code ${code}`);
    playNotifySound(repoRoot);
  });

  let latestSessionFile = null;
  if (payloadSessionFile && fs.existsSync(payloadSessionFile)) {
    latestSessionFile = payloadSessionFile;
    debugLog(`Using session file from payload: ${payloadSessionFile}`);
  }

  const repoMatch = latestSessionFile ? null : findLatestSessionFileForRepo(repoRoot);
  if (!latestSessionFile && repoMatch) {
    latestSessionFile = repoMatch.filePath;
  }
  let useHistoryFallback = false;

  if (latestSessionFile) {
    const matchedCwd = repoMatch ? repoMatch.cwd : '';
    debugLog(`Found session file: ${latestSessionFile}`);
    if (matchedCwd) {
      debugLog(`Matched session cwd: ${matchedCwd}`);
    }
  } else {
    debugLog('No session file found for current repo in ~/.codex/sessions');
    // Fallback to ~/.codex/history.jsonl
    const historyFile = path.join(os.homedir(), '.codex', 'history.jsonl');
    if (fs.existsSync(historyFile)) {
      debugLog(`Fallback to history file: ${historyFile}`);
      latestSessionFile = historyFile;
      useHistoryFallback = true;
    }
  }

  if (!latestSessionFile) {
    debugLog('No session content found. Exiting.');
    process.exit(0);
  }

  let sessionId;
  let allPromptTurns = [];

  if (useHistoryFallback) {
    // Extract session ID and prompts from history.jsonl
    // logic: read last line for session_id, then filter all prompts by that session_id
    try {
      const raw = fs.readFileSync(latestSessionFile, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      if (lines.length > 0) {
        const lastLine = JSON.parse(lines[lines.length - 1]);
        sessionId = lastLine.session_id;
        if (sessionId) {
          const prompts = lines.map(line => {
            try { return JSON.parse(line); } catch { return null; }
          })
            .filter(item => item && item.session_id === sessionId && item.text)
            .map(item => item.text);
          allPromptTurns = prompts.map((prompt) => ({ prompt, response: '' }));
        }
      }
    } catch (e) {
      process.exit(0);
    }
  } else {
    sessionId = path.basename(latestSessionFile, '.jsonl');
    allPromptTurns = extractPromptTurnsFromSessionJsonl(latestSessionFile);
  }

  if (!sessionId) process.exit(0);
  const timestamp = getTimestampUtcIso();
  const branch = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot) || '';

  const prevSessionKey = (safeReadFile(lastSessionFile) || '').trim();
  const currentSessionKey = useHistoryFallback ? sessionId : latestSessionFile;
  const isNewSession = currentSessionKey !== prevSessionKey;

  if (isNewSession) {
    safeWriteFile(lastPromptFile, '0');
    safeWriteFile(lastSessionFile, currentSessionKey);
    try {
      fs.rmSync(lastGitStateFile, { force: true });
    } catch {
      // ignore
    }
  }

  // allPrompts already populated based on source

  const filteredPrompts = sanitizePromptTurns(allPromptTurns);
  const currentPromptCount = filteredPrompts.length;
  if (currentPromptCount === 0) {
    debugLog('No user prompts after stripping instructions.');
    process.exit(0);
  }

  let lastPromptCount = 0;
  const lastPromptRaw = safeReadFile(lastPromptFile);
  if (lastPromptRaw) {
    const parsed = parseInt(lastPromptRaw.trim(), 10);
    if (!Number.isNaN(parsed) && parsed >= 0) lastPromptCount = parsed;
  }

  if (currentPromptCount <= lastPromptCount) {
    debugLog(`No new prompts. current=${currentPromptCount} last=${lastPromptCount}`);
    process.exit(0);
  }

  const newPrompts = filteredPrompts.slice(lastPromptCount);
  if (newPrompts.length === 0) process.exit(0);

  const gitHash = execGit(['rev-parse', 'HEAD'], repoRoot) || '';

  const prevState = safeReadJson(lastGitStateFile, {});
  const prevStateIsEmpty =
    !prevState || typeof prevState !== 'object' || Array.isArray(prevState) || Object.keys(prevState).length === 0;

  const allChangedFilesRaw = execGit(['diff', '--name-only'], repoRoot);
  const allChangedFiles = allChangedFilesRaw
    ? allChangedFilesRaw.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];

  const currentState = {};
  for (const file of allChangedFiles) {
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    const sum = execGit(['hash-object', fullPath], repoRoot);
    if (sum) currentState[file] = sum;
  }

  let newChangedFiles = [];
  if (prevStateIsEmpty) {
    newChangedFiles = allChangedFiles;
  } else {
    for (const file of allChangedFiles) {
      const currentSum = currentState[file] || '';
      const prevSum = typeof prevState[file] === 'string' ? prevState[file] : '';
      if (currentSum !== prevSum) newChangedFiles.push(file);
    }
  }

  newChangedFiles = newChangedFiles.filter(Boolean);
  const filesArray = newChangedFiles;

  let gitDiff = '';
  if (newChangedFiles.length > 0) {
    const diffResult = childProcess.spawnSync('git', ['diff', '--', ...newChangedFiles], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (diffResult.status === 0) gitDiff = (diffResult.stdout || '').trimEnd();
  }

  const newEntries = newPrompts
    .filter((turn) => turn && typeof turn.prompt === 'string' && turn.prompt.length > 0)
    .map((turn) => ({
      prompt: turn.prompt,
      response: turn.response || undefined,
      timestamp,
      hash: gitHash,
      files: filesArray,
      diff: gitDiff,
    }));

  if (newEntries.length === 0) process.exit(0);

  const sessions = safeReadJson(sessionsFile, []);
  const sessionsArray = Array.isArray(sessions) ? sessions : [];

  // If a new session started, mark the previous session as ended
  if (isNewSession && prevSessionKey) {
    let prevSessionId = prevSessionKey;
    if (prevSessionKey.endsWith('.jsonl')) prevSessionId = path.basename(prevSessionKey, '.jsonl');
    for (const session of sessionsArray) {
      if (session && session.id === prevSessionId) {
        session.inProgress = false;
        session.endedAt = timestamp;
      }
    }
  }

  const latestPrompt = newPrompts[newPrompts.length - 1]?.prompt || '';
  const existingIndex = sessionsArray.findIndex((s) => s && s.id === sessionId);
  if (existingIndex >= 0) {
    const session = sessionsArray[existingIndex];
    session.provider = 'codex';
    session.repoRoot = repoRoot;
    session.branch = branch;
    session.prompt = latestPrompt;
    session.diff = gitDiff;
    session.mode = 'interactive';
    session.autoTagged = true;
    session.inProgress = true;
    session.updatedAt = timestamp;

    if (!session.createdAt) session.createdAt = timestamp;
    if (!session.preHash) session.preHash = gitHash;
    if (!('postHash' in session)) session.postHash = null;

    session.files = mergeFiles(session.files, filesArray);
    session.perPromptChanges = [...(session.perPromptChanges || []), ...newEntries];
    session.responseSnippet = responseSnippetForChanges(session.perPromptChanges);
  } else {
    const session = {
      id: sessionId,
      provider: 'codex',
      repoRoot,
      branch,
      preHash: gitHash,
      postHash: null,
      prompt: latestPrompt,
      responseSnippet: responseSnippetForChanges(newEntries),
      files: uniq(filesArray),
      diff: gitDiff,
      createdAt: timestamp,
      updatedAt: timestamp,
      mode: 'interactive',
      autoTagged: true,
      inProgress: true,
      perPromptChanges: newEntries,
    };
    sessionsArray.unshift(session);
  }

  safeWriteFile(sessionsFile, JSON.stringify(sessionsArray, null, 2));
  safeWriteFile(lastPromptFile, String(currentPromptCount));
  safeWriteFile(lastGitStateFile, JSON.stringify(currentState, null, 2));

  // Keep settings.json creation behavior consistent with `promptvc init`
  if (!fs.existsSync(settingsFile)) {
    safeWriteFile(settingsFile, JSON.stringify({ notifySoundEnabled: true }, null, 2));
  }


}


try {
  main();
  process.exit(0);
} catch (error) {
  console.error(error);
  // Never break Codex sessions; on failure, do nothing and exit cleanly.
  process.exit(0);
}
