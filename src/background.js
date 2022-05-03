import * as path from 'path';
import * as fs from 'fs';
import { app, protocol, BrowserWindow, dialog, ipcMain } from 'electron';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer';
import JSONdb from 'simple-json-db';
import EncryptedStorage from './helpers/EncryptedStorage';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isPortable = process.env.PORTABLE_EXECUTABLE_DIR != null;
const userData = isPortable ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, process.env.PORTABLE_EXECUTABLE_APP_FILENAME + '-data') : app.getPath('userData');
const settingsPath = path.join(userData, isDevelopment ? 'settings.dev.json' : 'settings.json');
const accountPath = path.join(userData,  isDevelopment ? 'accounts.dev.json' : 'accounts.json');
const accountEncryptedPath = path.join(userData, isDevelopment ? 'accounts.encrypted.dev.json' : 'accounts.encrypted.json');

if(!fs.existsSync(userData)){
  // make data folder on first run
  fs.mkdirSync(userData) 
}

// load settings
const settings = new JSONdb(settingsPath);
settings.sync(); // make empty file on first run

// Accounts database
/** @type {JSONdb} */
let db = null; //* will be initialized later

let mainWindow = null;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

function createWindow(devPath, prodPath, windowProps) {
  // Create the browser window.
  let window = new BrowserWindow({ 
    width: 800, 
    height: 600,

    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      preload: path.join(__dirname, 'preload.js')
    },

    ...windowProps,
  });
  window.removeMenu();

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    window.loadURL(process.env.WEBPACK_DEV_SERVER_URL + devPath)
    if (!process.env.IS_TEST) window.webContents.openDevTools()
  } else {
    // Load the index.html when not in development
    window.loadURL(`app://./${prodPath}`)
  }

  window.on('closed', () => { window = null })
  return window
}

async function openDB() {
  try {

    // if we already have a db open, save and close it
    if (db) {
      db.sync(); // force save before opening again
      db = null;
    }

    // check if data is encrypted
    if (settings.get('encrypted')) {

      // error message shown next to the password field if authentication fails
      let error_message = null;

      // as for password indefinitely until we succeed or user quits the app
      while (true) {

        let pass = await new Promise(resolve => {
          let promptWindow = createWindow('password', 'password.html', {
            width: 500,
            height: 280,
            resizable: false,
          })
          
          promptWindow.webContents.send('password_dialog:init', error_message);

          passwordPromptResponse = null;
          ipcMain.once('encryption:password', (_, password) => passwordPromptResponse = password);

          promptWindow.on('closed', () => {
            // quit the app if the window was closed by the user without submitting anything
            if (passwordPromptResponse == null) {
              return app.quit();
            }

            resolve(passwordPromptResponse);
            promptWindow = null;
          })
        });

        try {
          // make sure the password is not empty (just in case, in theory that should be done by the ui)
          if (pass.length == 0) {
            throw 'Password can not be empty';
          }

          db = await new Promise((resolve, reject) => {
            try {
              const db = new EncryptedStorage(accountEncryptedPath, pass);
              db.on('error', reject); // this is for async errors
              db.on('loaded', () => resolve(db));
            } catch (error) {
              reject(error);
            }
          })

          // we decrypted successfully, exit loop
          break;
        } catch (error) {
          if (typeof error != 'string') {
            if (error.reason == 'BAD_DECRYPT') {
              error = 'Invalid password';
            }
            else if (error.code) {
              error = error.code;
            }
            else {
              error = error.toString();
            }
          }
          error_message = error;
        }
      }
      return;
    }
    db = new JSONdb(accountPath);
    db.sync();
  } catch (error) {
    await dialog.showMessageBox(null, {
      title: 'openDB Error',
      message: error.toString(),
      type: 'error'
    });
    app.quit();
  }
}

// add default settings
if (!settings.get('tags')) {
  settings.set('tags', {
      'good trust': '#00CC00',
      'yellow trust': '#ffCC00',
      'red trust': '#CC0000',
      'for sale': '#0066FF',
      'example tag': '#FF3399'
  });
}

if (typeof settings.get('encrypted') != 'boolean') { 
  // not encrypted by default
  settings.set('encrypted', false);
}

// check if current version is different than the last one
let updated = settings.get('version') != app.getVersion();
settings.set('version', app.getVersion());

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS);
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString());
    }
  }
  await openDB();

  mainWindow = createWindow('', 'index.html');
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('app:version', app.getVersion);

ipcMain.handle('app:ready', () => {
  if (mainWindow && updated) {
    mainWindow.webContents.send('update:changelog');
  }
});

ipcMain.handle('accounts:import', async event => {
  let file = await dialog.showOpenDialog(event.sender, { properties: ['openFile'], });
  if (file.canceled) {
    return;
  }
  file = file.filePaths[0];
  const fileContents = await fs.promises.readFile(file);
  let accs = fileContents.toString().split('\n').map(x => x.trim().split(':')).filter(x => x && x.length == 2);
  for (const acc of accs) {
    db.set(acc[0], {
      password: acc[1],
    });
  }
  for (const acc of accs) {
    // process_check_account(acc[0]);
    await new Promise(p => setTimeout(p, 200));
  }
});

ipcMain.handle('accounts:export', async event => {
  let file = await dialog.showSaveDialog(event.sender, {
    defaultPath: 'accounts.txt',
    filters: [
      {
        name: 'Text files',
        extensions: ['txt']
      },
      { 
        name: 'All Files', 
        extensions: ['*'] 
      }
    ]
  });
  if (file.canceled) {
    return;
  }
  let accs = Object.entries(db.JSON()).map(x => x[0] + ':' + x[1].password).join('\n');
  await fs.promises.writeFile(file.filePath, accs);
});

ipcMain.handle('accounts:add', (_, username, password) => db.set(username, { password: password }));

ipcMain.handle('accounts:get', () => db.JSON());

ipcMain.handle('accounts:update', (_, username, data) => {
  db.set(username, {
    ...db.get(username),
    ...data,
  });
});

ipcMain.handle('accounts:delete', (_, username) => db.delete(username));

ipcMain.handle('accounts:delete_all', () => db.deleteAll());

// ipcMain.handle('accounts:check', async (_, username) => await process_check_account(username));

ipcMain.handle("settings:get", (_, type) => settings.get(type));

ipcMain.handle("settings:set", (_, type, value) => settings.set(type, value));

// TODO: encryption setup/removal

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}
