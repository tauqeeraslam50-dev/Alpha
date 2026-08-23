const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Radio Network Management System v1.0',
    backgroundColor: '#0f172a',
    backgroundThrottling: false,
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath);
  else if (fs.existsSync(rootPath)) mainWindow.loadFile(rootPath);
  else mainWindow.loadURL('http://localhost:3000');

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Reload Workspace', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About RNMS v1.0',
          click: () => require('electron').dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Radio Network Management System v1.0',
            message: 'Radio Network Management System (RNMS) v1.0\\nDeveloped by Tauqeer Aslam\\n\\nGIS and offline map management have been separated into the standalone Pakistan Offline Map Manager.'
          })
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
