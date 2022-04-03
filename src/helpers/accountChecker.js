import User from "steam-user";
import SteamTotp from "steam-totp";
import { promisify } from "util";
import axios from "axios";
import { penalty_reason_permanent, penalty_reason_string, protoDecode, protoEncode, sleep } from "./util";
import { loadProtos } from "./protos";

const SteamTotp_getTimeOffset = promisify(SteamTotp.getTimeOffset);

const Protos = loadProtos([{
  name: 'csgo',
  protos: [
    __static + '/protos/cstrike15_gcmessages.proto',
    __static + '/protos/gcsdk_gcmessages.proto',
    __static + '/protos/base_gcmessages.proto',
  ]
}]);

// the difference between us and the steam server clocks
// stored globally since it will almost always be the same
let steamTimeOffset = null;

/**
 * @callback getSteamGuardCallback
 * @param {string} domain email domain that the code was sent to, null if it's the mobile authenticator
 * @returns {Promise<string | null>}
 */

/**
 * @typedef {Object} AccountCheckCallbacks
 * @property {getSteamGuardCallback} getSteamGuard
 */

/**
 * Logs on to specified account and performs all checks
 * @param {string} username login
 * @param {string} pass password
 * @param {string} [sharedSecret] mobile authenticator shared secret
 * @param {AccountCheckCallbacks} callbacks callbacks used to provide additional information when needed
 * @returns {Promise}
 */
export async function check_account(username, pass, sharedSecret = null, callbacks = null) {
  const steamClient = new User();

  const promise = new Promise((resolve, reject) => {
    const data = {
      prime: false,

      // when was a given game mode played for the last time
      last_game: null,
      last_game_wg: null,
      last_game_dz: null,

      penalty_reason: null,
      penalty_seconds: null,

      wins: null,
      wins_wg: null,
      wins_dz: null,

      rank: null,
      wins_wg: null,
      wins_dz: null,

      name: null,
      lvl: null,
      steamid: null,
    };
    
    let MatchmakingClient2GCHelloAttempts = 0;

    steamClient.logOn({
      accountName: username,
      password: pass,
      rememberPassword: true,
    });

    steamClient.on('disconnected', (eresult, msg) => {
      // this will most likely be called after the promise has resolved/rejected. 
      // But in case we get disconnected somewhere in the middle throw this just in case
      reject('disconnected');
    });

    steamClient.on('error', (e) => {
      let errorStr = ``;
      switch(e.eresult) {
        case 5:  errorStr = `Invalid Password`;         break;
        case 6:
        case 34: errorStr = `Logged In Elsewhere`;      break;
        case 84: errorStr = `Rate Limit Exceeded`;      break;
        case 65: errorStr = `steam guard is invalid`;   break;
        default: errorStr = `Unknown: ${e.eresult}`;    break;
      }
      reject(errorStr);
    });

    steamClient.on('steamGuard', async (domain, callback) => {

      // check if we can use the steam mobile authenticator secret
      //* NOTE: domain will be null for mobile authenticator
      if (domain == null && sharedSecret && sharedSecret.length > 0) { 

        // acquire the difference between us and the steam server clock if we have't already
        if (steamTimeOffset == null) {
          try {
            steamTimeOffset = await SteamTotp_getTimeOffset()
          } catch (error) {
            return reject(`unable to get steam totp time offset`);
          }
        }

        callback(SteamTotp.getAuthCode(sharedSecret, steamTimeOffset));
      } 
      else if (callbacks && callbacks.getSteamGuard) {
        try {
          const code = await callbacks.getSteamGuard();
          if (code == null || code.length == 0) {
            throw new Error('steam guard missing');
          }
          callback(code);
        } catch (error) {
          reject(error.message);
        }
      }
      else {
        reject(`steam guard missing`);
      }
    });

    steamClient.on('webSession', async (sessionID, cookies) => {
      try {
        // wait a bit just to be sure
        await sleep(1000);

        const res = await axios.get(`https://steamcommunity.com/profiles/${steamClient.steamID.getSteamID64()}/gcpd/730?tab=matchmaking`, {
          headers: {
            Cookie: cookies.join('; ') + ';'
          }
        });

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
      } catch (error) {
        console.log(e.message)
      }
    });

    steamClient.on('accountLimitations', () => {
      console.log(`logged into account ${username}`);

      // request a license for csgo, just in case we don't have one
      steamClient.requestFreeLicense([730], err => {
        if (err) {
          return reject(err.message);
        }

        // "start" csgo
        steamClient.gamesPlayed(730);
      })
    });

    steamClient.on('appLaunched', async (appid) => {
      console.log(`app ${appid} launched on account ${username}`);

      // wait a bit "for the game to start" otherwise it seems to fail
      await sleep(5000);

      // send MsgGCClientHello
      steamClient.sendToGC(appid, 4006, {}, Buffer.alloc(0));
    });

    steamClient.on('receivedFromGC', (appid, msgType, payload) => {
      console.log(`receivedFromGC ${msgType} on account ${username}`);
      switch(msgType) {

        //* MsgGCClientWelcome
        case 4004: {
          const CMsgClientWelcome = protoDecode(Protos.csgo.CMsgClientWelcome, payload);
          
          CMsgClientWelcome.outofdate_subscribed_caches.forEach(outofdate_cache => {
            outofdate_cache.objects.forEach(cache_object => {

              // look for CSOEconGameAccountClient (type id 7) that has data
              if (cache_object.type_id == 7 && cache_object.object_data.length > 0) {
                const CSOEconGameAccountClient = protoDecode(Protos.csgo.CSOEconGameAccountClient, cache_object.object_data[0]);

                // EXPBonusFlag::PrestigeEarned
                if ((CSOEconGameAccountClient.bonus_xp_usedflags & 16) != 0) {
                  data.prime = true;
                }

                // bought prime
                if (CSOEconGameAccountClient.elevated_state == 5) { 
                  data.prime = true;
                }
              }

            });
          });

          // send MsgGCCStrike15_v2_MatchmakingClient2GCHello after a second
          sleep(1000).then(() => steamClient.sendToGC(appid, 9109, {}, Buffer.alloc(0)));
          break;
        }

        //* MsgGCCStrike15_v2_MatchmakingGC2ClientHello
        case 9110: {
          //request wingman and dz rank as well (hidden by default)
          const clientGCRankUpdateMessage = protoEncode(Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate, { rankings: [ { rank_type_id: 7 }, { rank_type_id: 10 } ] });
          steamClient.sendToGC(appid, 9194, {}, clientGCRankUpdateMessage);

          let msg = protoDecode(Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello, payload);

          ++MatchmakingClient2GCHelloAttempts;
          // retry sending MatchmakingClient2GCHelloAttempts up to 5 times if we did not receive ranking inforamtion
          if(msg.ranking === null && MatchmakingClient2GCHelloAttempts < 5 && !msg.vac_banned) {
            sleep(2000).then(() => steamClient.sendToGC(appid, 9109, {}, Buffer.alloc(0)));
          }
          else {
            // make summunity bans more important since they affect the whole account
            if (steamClient.limitations.communityBanned) {
              data.penalty_reason = 'Community banned';
            }
            // check of we have any in game bans
            else if (msg.penalty_reason > 0) {
              data.penalty_reason = penalty_reason_string(msg.penalty_reason);
            }
            // vac bans are not part of "in-game bans"
            else if (msg.vac_banned) {
              data.penalty_reason = 'VAC';
            }
            // no ban
            else {
              // TODO: check if we can use null here (0 seems bad since it's meant to be a string)
              data.penalty_reason = 0;
            }

            // check if our ban is permanent
            if (msg.vac_banned || steamClient.limitations.communityBanned || penalty_reason_permanent(msg.penalty_reason)) {
              data.penalty_seconds = -1; // use negative time to signify permanent ban (aka no timer)
            }
            // check if our ban has a timer
            else if (msg.penalty_seconds > 0) {
              // calculate ban expiry date (in unix seconds)
              data.penalty_seconds = Math.floor(new Date().getTime() / 1000) + msg.penalty_seconds;
            }
            // not banned
            else {
              data.penalty_seconds = 0;
            }

            // since vac bans are not "in game" bans they preserve the rank(jut not displayed in the menu)
            // replicate csgo behavior by hiding them
            if (msg.vac_banned) {
              data.wins = -1;
              data.rank = -1;
            }
            else if (MatchmakingClient2GCHelloAttempts < 5) {
              data.wins = msg.ranking.wins;
              data.rank = msg.ranking.rank_id;
            }
            else {
              // no rank info
              data.wins = 0;
              data.wins = 0;
            }

            // basic profile info
            data.name = steamClient.accountInfo.name;
            data.lvl = msg.player_level;
            data.steamid = steamClient.steamID.getSteamID64();

            if(data.rank_wg != null && data.rank_dz != null) {
              resolve(data);
            }
          }
          break;
        }

        //* MsgGCCStrike15_v2_ClientGCRankUpdate
        case 9194: {
          let msg = protoDecode(Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate, payload);
          for (const ranking of msg.rankings) {
            
            // wingman
            if(ranking.rank_type_id == 7) {

              data.wins_wg = ranking.wins;
              data.rank_wg = ranking.rank_id;

              // vac banned
              if(data.wins === -1) { 
                data.wins_wg == -1;
                data.rank_wg == -1;
              }

              if(data.steamid != null && data.rank_dz != null) {
                resolve(data);
                break;
              }
            }
            
            // dangerzone
            if(ranking.rank_type_id == 10) {

              data.wins_dz = ranking.wins;
              data.rank_dz = ranking.rank_id;
              
              // vac banned
              if(data.wins === -1) { 
                data.wins_dz == -1;
                data.rank_dz == -1;
              }

              if(data.steamid != null && data.rank_wg != null) {
                resolve(data);
                break;
              }
            }

          }
        }
      }
    });
  });

  try {
    return await promise;
  } catch (error) {
    throw error;
  } finally {
    try {
      // always at least try to log off
      steamClient.logOff();
    } catch (_) { }
  }
}
