const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const isDev = require('electron-is-dev');
const EncryptedStorage = require('./EncryptedStorage.js');
let JSONdb = require('simple-json-db');
const got = require('got');
const User = require('steam-user');
const SteamTotp = require('steam-totp');
const fs = require('fs');
const path = require('path');
const { EOL } = require('os');
const { penalty_reason_string, protoDecode, protoEncode, penalty_reason_permanent } = require('./helpers/util.js');
const Protos = require('./helpers/protos.js')([{
    name: 'csgo',
    protos: [
        __dirname + '/protos/cstrike15_gcmessages.proto',
        __dirname + '/protos/gcsdk_gcmessages.proto',
        __dirname + '/protos/base_gcmessages.proto',
    ]
}]);

const browserWindowOptions = {};

if (process.platform === "linux") {
    browserWindowOptions.icon = path.join(`${__dirname}/icons/icon.png`);
}

const IS_PORTABLE = process.env.PORTABLE_EXECUTABLE_DIR != null;
const USER_DATA = IS_PORTABLE ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, process.env.PORTABLE_EXECUTABLE_APP_FILENAME + '-data') : app.getPath('userData');
const SETTINGS_PATH = path.join(USER_DATA, 'settings.json');
const ACCOUNTS_PATH = path.join(USER_DATA, 'accounts.json');
const ACCOUNTS_ENCRYPTED_PATH = path.join(USER_DATA, 'accounts.encrypted.json');

if(!fs.existsSync(USER_DATA)){
    fs.mkdirSync(USER_DATA) //makes data on first run
}

if (isDev) {
    try {
        require('electron-reload')(__dirname);
    } catch (_) { }
}

let steamTimeOffset = null;

let win = null

let passwordPromptResponse = null;

const settings = new JSONdb(SETTINGS_PATH);
settings.sync(); //makes empty file on first run

//will be initialized later
/**
 * @type {JSONdb}
 */
var db = null;

function beforeWindowInputHandler(window, event, input) {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        window.webContents.openDevTools();
        event.preventDefault();
    }
    if (input.control && input.key.toLowerCase() === 'r') {
        window.reload();
    }
}

async function openDB() {
    try {
        if (db) {
            db.sync(); //force save before switch
            db = null;
        }
        if (settings.get('encrypted')) {
            let error_message = null;
            while (true) {
                let pass = await new Promise((resolve, reject) => {
                    passwordPromptResponse = null;
                    let promptWindow = new BrowserWindow({
                        ...browserWindowOptions,
                        webPreferences: {
                            preload: path.join(__dirname, 'preload.js'),
                            contextIsolation: true,
                        },
                        width: 500,
                        height: 280,
                        resizable: false,
                        show: false
                    });
                    promptWindow.removeMenu();
                    promptWindow.loadFile(__dirname + '/html/password.html').then(() => {
                        promptWindow.webContents.send('password_dialog:init', error_message);
                    })
                    promptWindow.webContents.on('before-input-event', (event, input) => beforeWindowInputHandler(promptWindow, event, input));
                    promptWindow.once('ready-to-show', () => promptWindow.show())
                    promptWindow.on('closed', () => {
                        if (passwordPromptResponse == null) {
                            return app.quit();
                        }
                        resolve(passwordPromptResponse);
                        promptWindow = null;
                    })
                });
                try {
                    if (pass == null || pass.length == 0) {
                        throw 'Password can not be empty';
                    }
                    db = await new Promise((res, rej) => {
                        try {
                            let db = new EncryptedStorage(ACCOUNTS_ENCRYPTED_PATH, pass);
                            db.on('error', rej);//this is for async errors
                            db.on('loaded', () => res(db));
                        } catch (error) {
                            rej(error);
                        }
                    })
                    //we decrypted successfully, exit loop
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
        db = new JSONdb(ACCOUNTS_PATH);
        db.sync();
    } catch (error) {
        await dialog.showMessageBox(null, {
            title: 'openDB Error',
            message: error.toString(),
            type: 'error'
        });
    }
}

// add some defaults
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
    settings.set('encrypted', false);
}

let updated = settings.get('version') != app.getVersion();
settings.set('version', app.getVersion());

var currently_checking = [];

var mainWindowCreated = false;

function createWindow () {

    win = new BrowserWindow({
        ...browserWindowOptions,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        width: 1100,
        height: 650,
        minWidth: 1100,
        minHeight: 625
    });
    win.removeMenu();
    win.loadFile(__dirname + '/html/index.html');
    win.webContents.on('before-input-event', (event, input) => beforeWindowInputHandler(win, event, input));
    win.webContents.once('did-finish-load', () => {
        // disable automatic downloads in portable mode
        autoUpdater.autoDownload = !IS_PORTABLE && !isDev;
        autoUpdater.on('update-available', (info) => {
            const { provider } = autoUpdater.updateInfoAndProvider;
            const updateUrl = provider.baseUrl + provider.options.owner + '/' + provider.options.repo + '/releases/latest';
            win.webContents.send('update:available', autoUpdater.autoDownload, updateUrl);
        });
        autoUpdater.on('update-downloaded', (info) => {
            win.webContents.send('update:downloaded');
        });
        autoUpdater.on('error', (err) => {
            console.log(err);
        });
        if (autoUpdater.autoDownload) {
            autoUpdater.checkForUpdatesAndNotify();
        }
        else {
            autoUpdater.checkForUpdates();
        }
    });

    mainWindowCreated = true;
}

app.whenReady().then(async () => {
    await openDB();
    createWindow();
})

app.on('window-all-closed', () => {
    if (!mainWindowCreated) {
        return;
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
})

ipcMain.on('encryption:password', (_, password) => passwordPromptResponse = password);

ipcMain.handle('encryption:setup', async () => {
    let pass = await new Promise((resolve, reject) => {
        passwordPromptResponse = null;
        let promptWindow = new BrowserWindow({
            ...browserWindowOptions,
            parent: win,
            modal: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
            },
            width: 500,
            height: 375,
            resizable: false,
            show: false
        });
        promptWindow.removeMenu();
        promptWindow.loadFile(__dirname + '/html/encryption_setup.html');
        promptWindow.webContents.on('before-input-event', (event, input) => beforeWindowInputHandler(promptWindow, event, input));
        promptWindow.once('ready-to-show', () => promptWindow.show())
        promptWindow.on('closed', () => {
            if (passwordPromptResponse == null) {
                resolve(null);
            }
            resolve(passwordPromptResponse);
            promptWindow = null;
        })
    });
    if (pass == null) { //no data submitted
        return false;
    }
    try {
        db = await new Promise((res, rej) => {
            try {
                let new_db = new EncryptedStorage(ACCOUNTS_ENCRYPTED_PATH, pass, {
                    newData: db.JSON()
                });
                new_db.on('error', rej);//this is for async errors
                new_db.on('loaded', () => res(new_db));
            } catch (error) {
                rej(error);
            }
        });
        //delete plain text file
        fs.unlinkSync(ACCOUNTS_PATH);
        settings.set('encrypted', true);
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
});

ipcMain.handle('steamtotp', (_, data) => new Promise((resolve, reject) =>{
    SteamTotp.generateAuthCode(data.secret, (err, code) => {
        if (err) {
            console.error("err, " + err)
            reject(err);
            return;
        }
        resolve(code);
    })
}))

ipcMain.handle('encryption:remove', async () => {
    let error_message = null;
    while (true) {
        let pass = await new Promise((resolve, reject) => {
            passwordPromptResponse = null;
            let promptWindow = new BrowserWindow({
                ...browserWindowOptions,
                parent: win,
                modal: true,
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    contextIsolation: true,
                },
                width: 500,
                height: 280,
                resizable: false,
                show: false
            });
            promptWindow.removeMenu();
            promptWindow.loadFile(__dirname + '/html/password.html').then(() => {
                promptWindow.webContents.send('password_dialog:init', error_message, 'Remove encryption');
            })
            promptWindow.webContents.on('before-input-event', (event, input) => beforeWindowInputHandler(promptWindow, event, input));
            promptWindow.once('ready-to-show', () => promptWindow.show())
            promptWindow.on('closed', () => {
                if (passwordPromptResponse == null) {
                    resolve(null);
                }
                resolve(passwordPromptResponse);
                promptWindow = null;
            })
        });
        if (pass == null) { //no data submitted
            return true; //true is fail as we are still encrypted
        }
        try {
            if (pass.length == 0) {
                throw 'Password can not be empty';
            }
            //attempt to decrypt using this password
            let temp_db = await new Promise((res, rej) => {
                try {
                    let new_db = new EncryptedStorage(ACCOUNTS_ENCRYPTED_PATH, pass);
                    new_db.on('error', rej);//this is for async errors
                    new_db.on('loaded', () => res(new_db));
                } catch (error) {
                    rej(error);
                }
            });
            db = new JSONdb(ACCOUNTS_PATH);
            db.JSON(temp_db.JSON());
            db.sync();

            temp_db = null;

            //delete encrypted file
            fs.unlinkSync(ACCOUNTS_ENCRYPTED_PATH);
            settings.set('encrypted', false);
            return false; //false is success as in non encrypted
        } catch (error) {
            console.log(error);
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
});

ipcMain.handle('app:version', app.getVersion);

ipcMain.handle('accounts:get', () => {
    let data = db.JSON();
    for (const username in data) {
        if (Object.hasOwnProperty.call(data, username)) {
            const account = data[username];
            if(currently_checking.indexOf(username) != -1){
                account.pending = true;
            }
        }
    }
    return data;
});

async function process_check_account(username) {
    const account = db.get(username);
    if(!account) {
        return { error: 'unable to find account' };
    }

    try {
        const res = await check_account(username, account.password, account.sharedSecret);
        console.log(res);
        for (const key in res) {
            if (Object.hasOwnProperty.call(res, key)) {
                account[key] = res[key];
            }
        }
        db.set(username, account);
        return res;
    } catch (error) {
        console.log(error);
        account.error = error;
        db.set(username, account);
        return { error: error };
    }
}

ipcMain.handle('ready', () => {
    if (win && updated) {
        win.webContents.send('update:changelog', fs.readFileSync(__dirname + '/changelog.md').toString());
    }
});

ipcMain.handle('accounts:check', async (_, username) => await process_check_account(username));

ipcMain.handle('accounts:add', (_, username, password) => db.set(username, { password: password }));

ipcMain.handle('accounts:update', (_, username, data) => {
    let account = db.get(username);
    for (const key in data) {
        account[key] = data[key];
    }
    db.set(username, account);
});

ipcMain.handle('accounts:delete', (_, username) => db.delete(username));

ipcMain.handle('accounts:delete_all', (_) => db.deleteAll());

ipcMain.handle('accounts:import', async (event) => {
    let file = await dialog.showOpenDialog(event.sender, { properties: ['openFile'], });
    if (file.canceled) {
        return;
    }
    file = file.filePaths[0];
    let accs = fs.readFileSync(file).toString().split('\n').map(x => x.trim().split(':')).filter(x => x && x.length == 2);
    accs.forEach(acc => {
        db.set(acc[0], {
            password: acc[1],
        });
    });
    for (const acc of accs) {
        process_check_account(acc[0]);
        await new Promise(p => setTimeout(p, 200));
    }
});

ipcMain.handle('accounts:export', async (event) => {
    let file = await dialog.showSaveDialog({
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
    let accs = Object.entries(db.JSON()).map(x => x[0] + ':' + x[1].password).join(EOL);
    fs.writeFileSync(file.filePath, accs);
});

ipcMain.handle("settings:get", (_, type) => settings.get(type));

ipcMain.handle("settings:set", (_, type, value) => settings.set(type, value));

/**
 * Logs on to specified account and performs all checks
 * @param {string} username login
 * @param {string} pass password
 * @param {string} [sharedSecret] mobile authenticator shared secret
 * @returns {Promise}
 */
function check_account(username, pass, sharedSecret) {
    return new Promise((resolve, reject) => {
        sleep = (ms) => {
            return new Promise(resolve=>{
                setTimeout(resolve, ms);
            });
        }
        currently_checking.push(username);

        let attempts = 0;
        let Done = false;
        let steamClient = new User();

        steamClient.logOn({
            accountName: username,
            password: pass,
            rememberPassword: true,
        });

        steamClient.on('disconnected', (eresult, msg) => {
            currently_checking = currently_checking.filter(x => x !== username);
        });

        steamClient.on('error', (e) => {
            let errorStr = ``;
            switch(e.eresult) {
                case 5:  errorStr = `Invalid Password`;         break;
                case 6:
                case 34: errorStr = `Logged In Elsewhere`;      break;
                case 84: errorStr = `Rate Limit Exceeded`;     break;
                case 65: errorStr = `steam guard is invalid`;  break;
                default: errorStr = `Unknown: ${e.eresult}`;    break;
            }
            currently_checking = currently_checking.filter(x => x !== username);
            reject(errorStr);
        });

        steamClient.on('steamGuard', (domain, callback) => {
            if (domain == null && sharedSecret && sharedSecret.length > 0) { //domain will be null for mobile authenticator
                if (steamTimeOffset == null) {
                    SteamTotp.getTimeOffset((err, offset) => {
                        if (err) {
                            currently_checking = currently_checking.filter(x => x !== username);
                            reject(`unable to get steam time offset`);
                            return
                        }
                        steamTimeOffset = offset;
                        callback(SteamTotp.getAuthCode(sharedSecret, steamTimeOffset));
                    });
                    return;
                }
                callback(SteamTotp.getAuthCode(sharedSecret, steamTimeOffset));
            } else if (!win) {
                currently_checking = currently_checking.filter(x => x !== username);
                reject(`steam guard missing`);
            } else {
                win.webContents.send('steam:steamguard', username);
                ipcMain.once('steam:steamguard:response', async (event, code) => {
                    if (!code) {
                        currently_checking = currently_checking.filter(x => x !== username);
                        reject(`steam guard missing`);
                    } else {
                        callback(code);
                    }
                });
            }
        });

        steamClient.on('webSession', (sessionID, cookies ) => {
            sleep(1000).then(() => {
                got(`https://steamcommunity.com/profiles/${steamClient.steamID.getSteamID64()}/gcpd/730?tab=matchmaking`, {
                    headers: {
                        'Cookie': cookies.join('; ') + ';'
                    }
                }).then(res => {
                    let mm = /<td>Competitive<\/td><td>\d+<\/td><td>\d+<\/td><td>\d+<\/td><td>\d+<\/td><td>(\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d GMT)<\/td>/.exec(res.body);
                    let wg = /<td>Wingman<\/td><td>\d+<\/td><td>\d+<\/td><td>\d+<\/td><td>\d+<\/td><td>(\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d GMT)<\/td>/.exec(res.body);
                    let dz = /<td>Danger Zone<\/td><td>\d+<\/td><td>\d+<\/td><td>\d+<\/td><td>(\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d GMT)<\/td>/.exec(res.body);

                    if (mm) {
                        data.last_game = new Date(mm[1]);
                    }
                    if (wg) {
                        data.last_game_wg = new Date(wg[1]);
                    }
                    if (dz) {
                        data.last_game_dz = new Date(dz[1]);
                    }
                }).catch(e => console.log(e.message));
            });
        });

        steamClient.on('accountLimitations', () => {
            console.log(`logged into account ${username}`);
            steamClient.gamesPlayed(730);
        });

        steamClient.on('appLaunched', (appid) => {
            console.log(`app ${appid} launched on account ${username}`);
            sleep(5000).then(() => {
                steamClient.sendToGC(appid, 4006, {}, Buffer.alloc(0));
            });
        });

        let data = {};
        data.prime = false;

        steamClient.on('receivedFromGC', (appid, msgType, payload) => {
            console.log(`receivedFromGC ${msgType} on account ${username}`);
            switch(msgType) {
                case 4004: {
                    let CMsgClientWelcome = protoDecode(Protos.csgo.CMsgClientWelcome, payload);
                    for (let i = 0; i < CMsgClientWelcome.outofdate_subscribed_caches.length; i++) {
                        let outofdate_cache = CMsgClientWelcome.outofdate_subscribed_caches[i];
                        for (let j = 0; j < outofdate_cache.objects.length; j++) {
                            let cache_object = outofdate_cache.objects[j];
                            if (cache_object.object_data.length == 0) {
                                continue;
                            }
                            switch (cache_object.type_id) {
                            case 7: {
                                let CSOEconGameAccountClient = protoDecode(Protos.csgo.CSOEconGameAccountClient, cache_object.object_data[0]);
                                if ((CSOEconGameAccountClient.bonus_xp_usedflags & 16) != 0) { // EXPBonusFlag::PrestigeEarned
                                    data.prime = true;
                                }
                                if (CSOEconGameAccountClient.elevated_state == 5) { // bought prime
                                    data.prime = true;
                                }
                                break;
                            }
                            }
                        }
                    }
                    sleep(1000).then(() => {
                        steamClient.sendToGC(appid, 9109, {}, Buffer.alloc(0));
                    });
                    break;
                }
                case 9110: {
                    {
                        //request wingman and dz rank
                        let message = protoEncode(Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate, { rankings: [ { rank_type_id: 7 }, { rank_type_id: 10 } ] });
                        steamClient.sendToGC(appid, 9194, {}, message);
                    }

                    let msg = protoDecode(Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello, payload);

                    ++attempts;
                    if(msg.ranking === null && attempts < 5 && !msg.vac_banned) {
                        sleep(2000).then(() => {
                            steamClient.sendToGC(appid, 9109, {}, Buffer.alloc(0));
                        });
                    }
                    else {
                        if(!Done) {
                            Done = true;
                            currently_checking = currently_checking.filter(x => x !== username);
                            data.penalty_reason = steamClient.limitations.communityBanned ? 'Community ban' : msg.penalty_reason > 0 ? penalty_reason_string(msg.penalty_reason) : msg.vac_banned ? 'VAC' : 0;
                            data.penalty_seconds = msg.vac_banned || steamClient.limitations.communityBanned || penalty_reason_permanent(msg.penalty_reason) ? -1 : msg.penalty_seconds > 0 ? (Math.floor(Date.now() / 1000) + msg.penalty_seconds) : 0;
                            data.wins = msg.vac_banned ? -1 : attempts < 5 ? msg.ranking.wins : 0;
                            data.rank = msg.vac_banned ? -1 : attempts < 5 ? msg.ranking.rank_id : 0;
                            data.name = steamClient.accountInfo.name;
                            data.lvl = msg.player_level;
                            data.steamid = steamClient.steamID.getSteamID64();
                            data.error = null;
                            if(data.rank_wg != undefined && data.rank_dz != undefined) {
                                resolve(data);
                                steamClient.logOff();
                            }
                        }
                    }
                    break;
                }
                case 9194: {
                    let msg = protoDecode(Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate, payload);
                    for (const ranking of msg.rankings) {
                        if(ranking.rank_type_id == 7) { //wingman
                            data.wins_wg = ranking.wins;
                            data.rank_wg = ranking.rank_id;
                            if(data.wins === -1) { //vac banned
                                data.wins_wg == -1;
                                data.rank_wg == -1;
                            }
                            if(data.steamid != undefined && data.rank_dz != undefined) {
                                resolve(data);
                                steamClient.logOff();
                                break;
                            }
                        }
                        if(ranking.rank_type_id == 10) { //dangerzone
                            data.wins_dz = ranking.wins;
                            data.rank_dz = ranking.rank_id;
                            if(data.wins === -1) { //vac banned
                                data.wins_dz == -1;
                                data.rank_dz == -1;
                            }
                            if(data.steamid != undefined && data.rank_wg != undefined) {
                                resolve(data);
                                steamClient.logOff();
                                break;
                            }
                        }
                    }
                }
            }
        });
    });    
}
