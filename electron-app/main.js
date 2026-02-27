// electron-app/main.js
// Main Electron process - Creates window and manages app lifecycle

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Load .env files - use extraResources path when packaged (asar can't be read by dotenv)
const envDir = app.isPackaged
  ? path.join(process.resourcesPath, 'env')
  : __dirname;
const backendEnvPath = app.isPackaged
  ? path.join(process.resourcesPath, 'env', 'backend.env')
  : path.join(__dirname, 'backend', '.env');

const envPath = path.join(envDir, '.env');
const _envLog = [];
_envLog.push(`[ENV] app.isPackaged: ${app.isPackaged}`);
_envLog.push(`[ENV] Loading .env from: ${envPath} (exists: ${fs.existsSync(envPath)})`);
_envLog.push(`[ENV] Loading backend.env from: ${backendEnvPath} (exists: ${fs.existsSync(backendEnvPath)})`);

const result1 = require('dotenv').config({ path: envPath });
const result2 = require('dotenv').config({ path: backendEnvPath });

if (result1.error) _envLog.push(`[ENV] .env load error: ${result1.error.message}`);
else _envLog.push(`[ENV] .env loaded ${Object.keys(result1.parsed || {}).length} vars`);
if (result2.error) _envLog.push(`[ENV] backend.env load error: ${result2.error.message}`);
else _envLog.push(`[ENV] backend.env loaded ${Object.keys(result2.parsed || {}).length} vars`);

_envLog.push(`[ENV] MONGODB_URI set: ${!!process.env.MONGODB_URI}`);
_envLog.push(`[ENV] ORACLE_CONNECT_STRING set: ${!!process.env.ORACLE_CONNECT_STRING}`);
// Print immediately to console
_envLog.forEach(m => console.log(m));

const credentialManager = require('./utils/credentialManager');
const config = require('./config');

let mainWindow = null;
let expressServer = null;
let isAuthenticated = false;

// Setup logging for production debugging
const logFile = path.join(app.getPath('userData'), 'app.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {
    // Ignore write errors
  }
}

log('=== App Starting ===');
log(`App packaged: ${app.isPackaged}`);
log(`App path: ${app.getAppPath()}`);
log(`Resources path: ${process.resourcesPath}`);
log(`User data: ${app.getPath('userData')}`);
// Write env debug info to log file
_envLog.forEach(m => log(m));

// Catch unhandled errors
process.on('uncaughtException', (error) => {
  log(`UNCAUGHT EXCEPTION: ${error.message}`);
  log(error.stack);
  dialog.showErrorBox('Fatal Error', `Application error: ${error.message}\n\nCheck log at: ${logFile}`);
});

process.on('unhandledRejection', (error) => {
  log(`UNHANDLED REJECTION: ${error}`);
  if (error && error.stack) {
    log(`Stack trace: ${error.stack}`);
  }
  // Don't show dialog for non-critical errors, just log them
  // dialog.showErrorBox('Fatal Error', `Promise rejection: ${error}\n\nCheck log at: ${logFile}`);
});

// Set environment for backend
process.env.MONGODB_URI = config.mongodb.uri;
process.env.ORACLE_CONNECTION_STRING = config.oracle.connectString;
process.env.STATS_API_URL = config.statsApi.baseUrl;
process.env.PORT = config.server.port.toString();
process.env.USER_DATA_PATH = app.getPath('userData'); // For uploads directory

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: config.app.name,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webviewTag: true,
      webSecurity: config.app.isDev ? false : true // Disable in dev for local file loading
    },
    show: false // Don't show until ready
  });

  // Show window when ready to avoid flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Check if user has stored credentials
  checkAuthentication();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Development tools
  if (config.app.isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  // Handle navigation errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`❌ Failed to load: ${errorDescription}`);
  });

  // Catch renderer process crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log(`❌ Renderer process crashed! Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });

  // Catch renderer errors
  mainWindow.webContents.on('crashed', (event, killed) => {
    log(`❌ Renderer crashed! Killed: ${killed}`);
  });
}

/**
 * Check if user has stored credentials and authenticate
 */
async function checkAuthentication() {
  const hasCredentials = await credentialManager.hasStoredCredentials();

  if (hasCredentials) {
    const credentials = await credentialManager.getOracleCredentials();
    if (credentials) {
      // Try to authenticate with stored credentials
      const success = await testOracleConnection(credentials);
      if (success) {
        isAuthenticated = true;
        // Enable internal features (Oracle access)
        process.env.ENABLE_INTERNAL_FEATURES = 'true';
        log('✅ Internal features enabled (auto-login with stored credentials)');
        loadMainApp();
      } else {
        // Credentials invalid, show login
        await credentialManager.clearOracleCredentials();
        showLoginScreen();
      }
    } else {
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }
}

/**
 * Show login screen
 */
function showLoginScreen() {
  const loginPath = path.join(__dirname, 'renderer', 'login.html');
  mainWindow.loadFile(loginPath).then(() => {
    // Explicitly show the window after loading login screen
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

/**
 * Load main application (after successful login)
 */
function loadMainApp() {
  log('Loading main app...');

  // Start Express server
  if (!expressServer) {
    try {
      log('Starting Express server...');
      expressServer = require('./server');
      log(`✅ Express server running on http://${config.server.host}:${config.server.port}`);
    } catch (error) {
      log(`❌ Failed to start Express server: ${error.message}`);
      log(error.stack);
      dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}\n\nCheck log at: ${logFile}`);
      return;
    }
  }

  // Load React app - handle both dev and production paths
  let frontendPath;

  if (app.isPackaged) {
    // In production, files are in resources/app.asar or resources/app
    frontendPath = path.join(process.resourcesPath, 'app', 'frontend', 'build', 'index.html');
    log(`Packaged mode - frontend path: ${frontendPath}`);
  } else {
    // In development, use relative path
    frontendPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
    log(`Dev mode - frontend path: ${frontendPath}`);
  }

  // Check if file exists
  if (!fs.existsSync(frontendPath)) {
    log(`❌ Frontend file not found: ${frontendPath}`);
    dialog.showErrorBox('Frontend Error', `Frontend file not found: ${frontendPath}\n\nCheck log at: ${logFile}`);
    return;
  }

  log('Loading frontend...');
  mainWindow.loadFile(frontendPath).then(() => {
    log('✅ Frontend loaded successfully');
    // Explicitly show the window after loading
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      log('✅ Window shown');
    }
  }).catch(error => {
    log(`❌ Failed to load frontend: ${error.message}`);
    log(error.stack);
    dialog.showErrorBox('Load Error', `Failed to load app: ${error.message}\n\nCheck log at: ${logFile}`);
  });
}

/**
 * Test Oracle connection with credentials
 */
async function testOracleConnection(credentials) {
  try {
    // Set credentials for backend to use
    process.env.ORACLE_USER = credentials.username;
    process.env.ORACLE_PASSWORD = credentials.password;

    const oracledb = require('oracledb');

    const connection = await oracledb.getConnection({
      user: credentials.username,
      password: credentials.password,
      connectString: config.oracle.connectString
    });

    await connection.close();
    log('✅ Oracle connection successful');
    return true;
  } catch (error) {
    log(`❌ Oracle connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Handle login attempt from renderer
 */
ipcMain.handle('login', async (event, { username, password, rememberMe }) => {
  try {
    // Test connection
    const success = await testOracleConnection({ username, password });

    if (success) {
      // Store credentials if remember me is checked
      if (rememberMe) {
        await credentialManager.storeOracleCredentials(username, password);
      }

      isAuthenticated = true;

      // Set credentials for backend
      process.env.ORACLE_USER = username;
      process.env.ORACLE_PASSWORD = password;

      // Enable internal features (Oracle/Stats API access)
      process.env.ENABLE_INTERNAL_FEATURES = 'true';
      log('✅ Internal features enabled (Oracle login successful)');

      // Load main app
      loadMainApp();

      return { success: true };
    } else {
      return {
        success: false,
        error: 'Invalid credentials or unable to connect to Oracle database'
      };
    }
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message || 'Connection failed'
    };
  }
});

/**
 * Handle login without VPN (baseline-only mode)
 * Skips Oracle authentication and runs with ENABLE_INTERNAL_FEATURES=false
 */
ipcMain.handle('login-no-vpn', async () => {
  try {
    log('Starting in no-VPN mode (baseline comparisons only)');

    // Disable internal features (Oracle/Stats API)
    process.env.ENABLE_INTERNAL_FEATURES = 'false';

    // Clear any Oracle credentials from environment
    delete process.env.ORACLE_USER;
    delete process.env.ORACLE_PASSWORD;

    isAuthenticated = true;

    // Load main app
    loadMainApp();

    return { success: true };
  } catch (error) {
    console.error('No-VPN login error:', error);
    return {
      success: false,
      error: error.message || 'Failed to start in no-VPN mode'
    };
  }
});

/**
 * Handle logout
 */
ipcMain.handle('logout', async () => {
  try {
    await credentialManager.clearOracleCredentials();
    isAuthenticated = false;

    // Stop Express server
    if (expressServer && expressServer.close) {
      expressServer.close();
      expressServer = null;
    }

    showLoginScreen();
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get Oracle connection defaults for login screen
 */
ipcMain.handle('get-oracle-defaults', async () => {
  // Parse connection string for display
  // Format: hostname:port/service_name
  const parts = config.oracle.connectString.split('/');
  const serviceName = parts[1] || 'N/A';
  const hostPort = parts[0] || config.oracle.connectString;

  return {
    connectString: config.oracle.connectString,
    hostPort: hostPort,
    serviceName: serviceName
  };
});

/**
 * Auto-updater configuration
 */
if (config.app.autoUpdateEnabled && !config.app.isDev) {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: 'A new version is available. Downloading now...'
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The application will restart to install the update.',
      buttons: ['Restart Now', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Check for updates every hour
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 3600000);
}

/**
 * App lifecycle events
 */
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up
  if (expressServer && expressServer.close) {
    expressServer.close();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred: ${error.message}`);
});
