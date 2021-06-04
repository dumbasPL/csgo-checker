const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const isDev = require('electron-is-dev');
const JSONdb = require('simple-json-db');
const got = require('got');
var User = require('steam-user');
const fs = require('fs');
const util = require('util');
const {EOL} = require('os');
const { penalty_reason_string, protoDecode, protoEncode, penalty_reason_permanent } = require('./helpers/util.js');
const Protos = require('./helpers/protos.js')([{
    name: 'csgo',
    protos: [
        __dirname + '/protos/cstrike15_gcmessages.proto',
        __dirname + '/protos/gcsdk_gcmessages.proto',
        __dirname + '/protos/base_gcmessages.proto',
    ]
}]);
if(!fs.existsSync(app.getPath('userData'))){
    fs.mkdirSync(app.getPath('userData')) //makes data on first run
}

if (isDev) {
    try {
        require('electron-reload')(__dirname);
    } catch (_) { }
}

let win = null

const db = new JSONdb(app.getPath('userData') + '/accounts.json');
db.sync(); //makes empty file on first run
const settings = new JSONdb(app.getPath('userData') + '/settings.json');
settings.sync(); //makes empty file on first run

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

let updated = settings.get('version') != app.getVersion();
settings.set('version', app.getVersion());

var currently_checking = [];

function createWindow () {
    win = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
        },
        width: 1100,
        height: 650,
        minWidth: 1100,
        minHeight: 625
    });
    win.removeMenu();
    win.loadFile(__dirname + '/html/index.html');
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            win.webContents.openDevTools();
            event.preventDefault();
        }
        if (input.control && input.key.toLowerCase() === 'r') {
            win.reload();
        }
    });

}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
})

app.on('ready', function()  {
    if (!isDev) {
        autoUpdater.on('update-available', (info) => {
            win.webContents.send('update:available');
        })
        autoUpdater.on('update-downloaded', (info) => {
            win.webContents.send('update:downloaded');
        });
        autoUpdater.on('error', (err) => {
            console.log(err);
        })
        autoUpdater.checkForUpdatesAndNotify();
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
        const res = await check_account(username, account.password);
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
        if (Object.hasOwnProperty.call(data, key)) {
            account[key] = data[key];
        }
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

function check_account(username, pass) {
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
            // console.log(e);
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
            if (!win) {
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
                            // console.log(util.inspect(msg, false, null));
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