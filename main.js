require('dotenv').config();
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { runCompare, LARGE_FILE_THRESHOLD } = require('./compare-core');
const { runCompareGemini } = require('./generativecomp');
const { runCustomAnalysis, MAX_FILES: ANALYZE_MAX_FILES } = require('./analyze-ai');

/** Collect every file under folder (no extension filter). Skips dot-directories, `.git`, `node_modules`. */
function collectFilesFromFolder(rootDir, maxFiles) {
  const results = [];
  function walk(dir) {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (results.length >= maxFiles) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;
        walk(full);
      } else {
        results.push({
          path: full,
          originalName: path.relative(rootDir, full).split(path.sep).join('/') || ent.name
        });
      }
    }
  }
  walk(rootDir);
  return results;
}

const ALL_FILES_FILTER = [{ name: 'All files', extensions: ['*'] }];

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: ALL_FILES_FILTER
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('validate-file-path', async (event, filepath) => {
  try {
    if (!filepath || typeof filepath !== 'string') {
      return { valid: false, reason: 'No file path.' };
    }
    const st = fs.statSync(filepath);
    if (st.isDirectory()) {
      return { valid: false, reason: 'Please select a file, not a folder.' };
    }
    if (!st.isFile()) {
      return { valid: false, reason: 'That path is not a file.' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: err.message || 'Could not read that path.' };
  }
});

ipcMain.handle('get-file-size', async (event, filepath) => {
  try {
    const stats = fs.statSync(filepath);
    return {
      bytes: stats.size,
      mb: (stats.size / 1024 / 1024).toFixed(2),
      isLarge: stats.size > LARGE_FILE_THRESHOLD
    };
  } catch (err) {
    return null;
  }
});

ipcMain.handle('compare-files', async (event, file1, file2) => {
  if (process.env.COMPARE_MODE === 'gemini') {
    return runCompareGemini(file1, file2);
  }
  return runCompare(file1, file2);
});

ipcMain.handle('select-multiple-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: ALL_FILES_FILTER
  });
  if (canceled || !filePaths || !filePaths.length) return [];
  return filePaths.map((p) => ({ path: p, originalName: path.basename(p) }));
});

ipcMain.handle('select-folder-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: ALL_FILES_FILTER
  });
  if (canceled || !filePaths || !filePaths.length) return [];

  const out = [];
  const seen = new Set();
  for (const p of filePaths) {
    if (out.length >= ANALYZE_MAX_FILES) break;
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const nested = collectFilesFromFolder(p, ANALYZE_MAX_FILES);
      for (const n of nested) {
        if (out.length >= ANALYZE_MAX_FILES) break;
        if (!n || typeof n.path !== 'string') continue;
        if (seen.has(n.path)) continue;
        seen.add(n.path);
        out.push(n);
      }
    } else if (st.isFile()) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push({ path: p, originalName: path.basename(p) });
    }
  }
  return out;
});

ipcMain.handle('analyze-with-prompt', async (event, payload) => {
  const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];
  const prompt = payload && typeof payload.prompt === 'string' ? payload.prompt : '';
  if (!entries.length) {
    return {
      diff: [{ value: 'Error: Add at least one file or folder first.', added: false, removed: false }],
      meta: null
    };
  }
  const fileEntries = [];
  const seenPaths = new Set();
  for (const e of entries.slice(0, ANALYZE_MAX_FILES)) {
    if (!e || typeof e.path !== 'string') continue;
    try {
      const st = fs.statSync(e.path);
      if (st.isDirectory()) {
        const nested = collectFilesFromFolder(e.path, ANALYZE_MAX_FILES);
        for (const n of nested) {
          if (fileEntries.length >= ANALYZE_MAX_FILES) break;
          if (!n || typeof n.path !== 'string') continue;
          if (seenPaths.has(n.path)) continue;
          seenPaths.add(n.path);
          fileEntries.push({
            path: n.path,
            originalName:
              (e.originalName ? `${e.originalName}/` : '') + (n.originalName || path.basename(n.path))
          });
        }
        continue;
      }
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    if (seenPaths.has(e.path)) continue;
    seenPaths.add(e.path);
    fileEntries.push({
      path: e.path,
      originalName: e.originalName || path.basename(e.path)
    });
  }
  if (!fileEntries.length) {
    return {
      diff: [{ value: 'Error: No readable files from your selection.', added: false, removed: false }],
      meta: null
    };
  }
  return runCustomAnalysis(fileEntries, prompt);
});
