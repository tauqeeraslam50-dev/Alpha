const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable hardware acceleration issues on older offline workstations if needed
// app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Radio Network Management System v1.0 (Air-Gapped Standalone)",
    backgroundColor: '#0f172a',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows seamless local offline file and tile loading
      allowRunningInsecureContent: true
    }
  });

  // Locate the production built index.html or fallback to root
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else if (fs.existsSync(rootPath)) {
    mainWindow.loadFile(rootPath);
  } else {
    // If running in development mode
    mainWindow.loadURL('http://localhost:3000');
  }

  // Build standard desktop menu for RF Engineers
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload Workspace',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
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
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Offline Engine',
      submenu: [
        {
          label: 'Offline Vector Topo Mode: Active',
          enabled: false
        },
        {
          label: 'Gazetteer Database: 100% Local',
          enabled: false
        },
        {
          label: 'RF Compute Engine: 100% Client-Side',
          enabled: false
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About RNMS v1.0',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Radio Network Management System v1.0',
              message: 'Radio Network Management System (RNMS) v1.0\nDeveloped by Tauqeer Aslam\nContact: TAUQEERASLAM50@gmail.com\n\n100% Air-Gapped & Offline Desktop Edition.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Prevent external link escapes
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
