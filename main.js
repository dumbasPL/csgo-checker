const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const { autoUpdater } = require("electron-updater");
const isDev = require('electron-is-dev');
const JSONdb = require('simple-json-db');
var User = require('steam-user');
const fs = require('fs');
const util = require('util');
const { penalty_reason_string, rank_string } = require('./helpers/util.js');
const Protos = require('./helpers/protos.js')([{
    name: "csgo",
    protos: [
        __dirname + "/protos/cstrike15_gcmessages.proto",
        __dirname + "/protos/gcsdk_gcmessages.proto",
        __dirname + "/protos/base_gcmessages.proto",
    ]
}]);
if(!fs.existsSync(app.getPath('userData'))){
    fs.mkdirSync(app.getPath('userData')) //makes data on first run
}

let win = null

const db = new JSONdb(app.getPath('userData') + '/accounts.json');
db.sync(); //makes empty file on first run

var currently_checking = [];

function createWindow () {
    win = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
        },
        width: 1100,
        height: 650,
    });
    win.removeMenu();
    win.loadFile('index.html');
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            win.webContents.openDevTools();
            event.preventDefault();
        }
    })
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

ipcMain.handle("app:version", app.getVersion);

ipcMain.handle("accounts:get", () => {
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
        return {
            error: "unable to find account"
        };
    }

    try {
        const res = await check_account(username, account.password);
        console.log(res);
        db.set(username, {
            password: account.password,
            name: res.name,
            penalty_reason: res.penalty_reason,
            penalty_seconds: res.penalty_seconds,
            rank: res.rank,
            wins: res.wins,
            wins_wg: res.wins_wg,
            rank_wg: res.rank_wg,
            lvl: res.lvl,
            steamid: res.steamid,
            prime: res.prime,
        });
        return res;
    } catch (error) {
        console.log(error);
        db.set(username, {
            password: account.password,
            error: error
        });
        return {
            error: error
        };
    }
}

ipcMain.handle("accounts:check", async (event, username) => await process_check_account(username));

ipcMain.handle("accounts:add", (event, username, password) => {
    db.set(username, {
        password: password,
    });
});

ipcMain.handle("accounts:delete", (event, username, password) => {
    db.delete(username);
});

ipcMain.handle("accounts:import", async (event, username, password) => {
    let file = await dialog.showOpenDialog(event.sender, { properties: ['openFile'], });
    if(file.canceled) return;
    file = file.filePaths[0];
    let accs = fs.readFileSync(file).toString().split('\n').map(x => x.trim().split(":")).filter(x => x && x.length == 2);
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

function check_account(username, pass) {
    return new Promise((resolve, reject) => {
        sleep = (ms) => {
            return new Promise(resolve=>{
                setTimeout(resolve,ms)
            });
        }
        currently_checking.push(username);

        let attempts = 0;
        let AcknowledgedPenalty = false;
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
            console.log(e);
            let errorStr = ``;
            switch(e.eresult) {
                case 5: {
                    errorStr = `Invalid Password`;
                    break;
                }
                case 6:
                case 34: {
                    errorStr = `Logged In Elsewhere`;
                    break;
                }
                case 84: {
                    errorStr =  `Rate Limit Exceeded`;
                    break;
                }
                case 65: {
                    errorStr =  `steam guard is invalid`;
                    break;
                }
                default: {
                    errorStr = `Unknown: ${e.eresult}`;
                    break;
                }
            }
            currently_checking = currently_checking.filter(x => x !== username);
            reject(errorStr);
        });

        steamClient.on('steamGuard', (domain, callback) => {
            if (!win) {
                currently_checking = currently_checking.filter(x => x !== username);
                reject(`steam guard is enabled`);
            } else {
                win.webContents.send('steam:steamguard', username);
                ipcMain.once('steam:steamguard:response', async (event, code) => {
                    if (!code) {
                        currently_checking = currently_checking.filter(x => x !== username);
                        reject(`steam guard is enabled`);
                    } else {
                        callback(code);
                    }
                });
            }
        });

        // steamClient.on('vacBans', (numBans, appids) => {
        steamClient.on('accountLimitations', (numBans, appids) => {
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
                    let msg = Protos.csgo.CMsgClientWelcome.decode(payload);
                    msg = Protos.csgo.CMsgClientWelcome.toObject(msg, { defaults: true });
                    for (let i = 0; i < msg.outofdate_subscribed_caches.length; i++) {
                        let msg2 = msg.outofdate_subscribed_caches[i];
                        for (let j = 0; j < msg2.objects.length; j++) {
                            let msg3 = msg2.objects[j];
                            if (msg3.object_data.length == 0) {
                                continue;
                            }
                            switch (msg3.type_id) {
                            case 2: {
                                let msg4 = Protos.csgo.CSOPersonaDataPublic.decode(msg3.object_data[0]);
                                msg4 = Protos.csgo.CSOPersonaDataPublic.toObject(msg4, { defaults: true });
                                if (msg4.player_level >= 21) {
                                    data.prime = true;
                                }
                                break;
                            }
                            case 7: {
                                let msg4 = Protos.csgo.CSOEconGameAccountClient.decode(msg3.object_data[0]);
                                msg4 = Protos.csgo.CSOEconGameAccountClient.toObject(msg4, { defaults: true });
                                if ((msg4.bonus_xp_usedflags & 16) != 0) { //EXPBonusFlag.PrestigeEarned
                                    data.prime = true;
                                }
                                if (msg4.elevated_state == 5) {
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
                        let message = Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate.create({ rankings: [ { rank_type_id: 7 } ] });//request wingman rank
                        let encoded = Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate.encode(message);
                        steamClient.sendToGC(appid, 9194, {}, encoded.finish());
                    }

                    let msg = Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello.decode(payload);
                    msg = Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello.toObject(msg, { defaults: true });

                    if(!AcknowledgedPenalty && msg.penalty_seconds > 0) {
                        let message = Protos.csgo.CMsgGCCStrike15_v2_AcknowledgePenalty.create({
                            acknowledged: 1
                        });
                        let encoded = Protos.csgo.CMsgGCCStrike15_v2_AcknowledgePenalty.encode(message);

                        sleep(2000).then(() => {
                            steamClient.sendToGC(appid, 9171, {}, encoded.finish());
                        });

                        AcknowledgedPenalty = true;

                        sleep(2000).then(() => {
                            steamClient.sendToGC(appid, 4006, {}, Buffer.alloc(0));
                        });

                        return;
                    }

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
                            data.penalty_reason = steamClient.limitations.communityBanned ? 'Community' : msg.penalty_reason > 0 ? penalty_reason_string(msg.penalty_reason) : msg.vac_banned ? 'VAC' : 0,
                            data.penalty_seconds = msg.vac_banned || steamClient.limitations.communityBanned ? -1 : msg.penalty_seconds > 0 ? (Math.floor(Date.now() / 1000) + msg.penalty_seconds) : 0,
                            data.wins = msg.vac_banned ? -1 : attempts < 5 ? msg.ranking.wins : 0,
                            data.rank = msg.vac_banned ? -1 : attempts < 5 ? rank_string(msg.ranking.rank_id, msg.ranking.wins) : 0,
                            data.name = steamClient.accountInfo.name,
                            data.lvl = msg.player_level,
                            data.steamid = steamClient.steamID.getSteamID64()
                            if(data.rank_wg != undefined) {
                                resolve(data);
                                steamClient.logOff();
                            }
                        }
                    }
                    break;
                }
                case 9194: {
                    let msg = Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate.decode(payload);
                    msg = Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate.toObject(msg, { defaults: true });
                    for (const ranking of msg.rankings) {
                        if(ranking.rank_type_id == 7) { //wingman
                            console.log(msg);
                            data.wins_wg = ranking.wins;
                            data.rank_wg = rank_string(ranking.rank_id, ranking.wins);
                            if(data.wins === -1) { //vac banned
                                data.wins_wg == -1;
                                data.rank_wg == -1;
                            }
                            if(data.steamid != undefined) {
                                resolve(data);
                                steamClient.logOff();
                                break;
                            }
                        }
                    }
                }
                default:
                    break;
            }
        });
    });    
}