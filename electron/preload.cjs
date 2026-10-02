const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ipc', {
  login: (creds) => ipcRenderer.invoke('auth:login', creds),
  mooe: {
    getAll: () => ipcRenderer.invoke('mooe:getAll'),
    save: (entry) => ipcRenderer.invoke('mooe:save', entry),
    delete: (key) => ipcRenderer.invoke('mooe:delete', key),
  },
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  // Print preview / printing
  print: {
    getPrinters: () => ipcRenderer.invoke('print:get-printers'),
    renderPreview: (settings) => ipcRenderer.invoke('print:render-preview', settings),
    execute: (settings) => ipcRenderer.invoke('print:execute', settings),
    cleanupPreview: () => ipcRenderer.invoke('print:cleanup-preview'),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('update:check'),
    quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
    onChecking: (callback) => ipcRenderer.on('update:checking', () => callback()),
    onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_, info) => callback(info)),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update:not-available', (_, info) => callback(info)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (_, info) => callback(info)),
    onError: (callback) => ipcRenderer.on('update:error', (_, error) => callback(error)),
  }
})