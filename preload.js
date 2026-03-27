const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  compareFiles: (f1, f2) => ipcRenderer.invoke('compare-files', f1, f2),
  getFileSize: (filepath) => ipcRenderer.invoke('get-file-size', filepath),
  validateFilePath: (filepath) => ipcRenderer.invoke('validate-file-path', filepath),
  onProgress: (callback) => ipcRenderer.on('compare-progress', (event, data) => callback(data))
});
