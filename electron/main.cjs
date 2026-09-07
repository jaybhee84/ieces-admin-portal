const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Disable auto download if you want to prompt the user before downloading
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

// ── Data storage (JSON file, acts like simple DB) ──
const dataDir = path.join(app.getPath('userData'), 'ieces-data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const dbFile = path.join(dataDir, 'ieces.json')

function readDB() {
  try {
    if (fs.existsSync(dbFile)) return JSON.parse(fs.readFileSync(dbFile, 'utf8'))
  } catch {}
  return { mooe: [], users: [{ username: 'admin', password: 'ieces2024', name: 'Administrator' }] }
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2))
}

// ── Window ──
let win

function createApplicationMenu() {
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForUpdatesManual()
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function checkForUpdatesManual() {
  if (isDev) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Update checks are disabled in development mode.',
    })
    return
  }

  // Trigger manual check and inform renderer
  win?.webContents.send('update:checking')
  autoUpdater.checkForUpdates().catch((err) => {
    dialog.showErrorBox('Update Check Error', err?.message || 'Failed to check for updates.')
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    title: 'IECES Admin Portal',
    show: false
  })

  createApplicationMenu()

  if (isDev) {
    win.webContents.openDevTools()

    const loadDevServer = async () => {
      try {
        await win.loadURL('http://localhost:5173')
      } catch (err) {
        console.log('Dev server not ready, retrying in 1s...')
        setTimeout(loadDevServer, 1000)
      }
    }

    loadDevServer()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    // Auto check on launch in production
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── Auto Updater Events ──
autoUpdater.on('checking-for-update', () => {
  win?.webContents.send('update:checking')
})

autoUpdater.on('update-available', (info) => {
  win?.webContents.send('update:available', info)
})

autoUpdater.on('update-not-available', (info) => {
  win?.webContents.send('update:not-available', info)
})

autoUpdater.on('update-downloaded', (info) => {
  win?.webContents.send('update:downloaded', info)
})

autoUpdater.on('error', (err) => {
  win?.webContents.send('update:error', err?.message || err)
})

// ── IPC Handlers ──

// Auth
ipcMain.handle('auth:login', (_, { username, password }) => {
  const db = readDB()
  const user = db.users.find(u => u.username === username && u.password === password)
  if (user) return { ok: true, name: user.name }
  return { ok: false }
})

// MOOE
ipcMain.handle('mooe:getAll', () => {
  const db = readDB()
  return db.mooe || []
})

ipcMain.handle('mooe:save', (_, entry) => {
  const db = readDB()
  if (!db.mooe) db.mooe = []
  const idx = db.mooe.findIndex(r => r.sy === entry.sy && r.month === entry.month)
  entry.savedAt = new Date().toISOString()
  if (idx >= 0) db.mooe[idx] = entry
  else db.mooe.push(entry)
  writeDB(db)
  return { ok: true }
})

ipcMain.handle('mooe:delete', (_, { sy, month }) => {
  const db = readDB()
  db.mooe = (db.mooe || []).filter(r => !(r.sy === sy && r.month === month))
  writeDB(db)
  return { ok: true }
})

ipcMain.handle('app:getVersion', () => app.getVersion())

// Updater IPC
ipcMain.handle('update:check', () => autoUpdater.checkForUpdates())
ipcMain.handle('update:quitAndInstall', () => autoUpdater.quitAndInstall())
