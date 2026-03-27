const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { runCompare, LARGE_FILE_THRESHOLD } = require('./compare-core');

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
    filters: [
      {
        name: 'Documents',
        extensions: [
          'pdf',
          'csv',
          'txt',
          'docx',
          'xlsx',
          'xls',
          'xlsm',
          'xlsb',
          'ods',
          'rtf',
          'md',
          'json',
          'xml',
          'html',
          'htm'
        ]
      },
      { name: 'All files', extensions: ['*'] }
    ]
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
  return runCompare(file1, file2);
});
