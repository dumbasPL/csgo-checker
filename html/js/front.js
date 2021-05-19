const equal = require('fast-deep-equal');
const { ipcRenderer, clipboard, shell } = require('electron');
const friendCode = require("csgo-friendcode");
ipcRenderer.invoke("app:version").then(v => document.title += " " + v);

let account_cache = {};
let tags_cache = {};

/**
 * Get correct image name for given rank
 * @param {Number} rank ranking
 * @param {Number} wins number of wins
 * @param {'mm' | 'wg' | 'dz'} type rank type 
 * @returns {String}
 */ 
function getRankImage(rank, wins, type) {
  let prefix = 'img/skillgroups/';
  switch (type) {
    case 'mm': prefix += 'skillgroup'; break;
    case 'wg': prefix += 'wingman'; break;
    case 'dz': prefix += 'dangerzone'; break;
  }
  if (rank <= 0) {
    rank = 0;
  }
  if (rank == 0 && wins >= 10) {
    return prefix + '_expired.svg';
  }
  return prefix + rank + '.svg';
}

/**
 * Format countdown string
 * @param {Number} seconds seconds remaining
 * @returns formatted string
 */
function countdown(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  seconds  -= d * 3600 * 24;
  const h = Math.floor(seconds / 3600);
  seconds  -= h * 3600;
  const m = Math.floor(seconds / 60);
  seconds  -= m * 60;
  const tmp = [];
  (d) && tmp.push(d + 'd');
  (d || h) && tmp.push(h + 'h');
  (d || h || m) && tmp.push(m + 'm');
  tmp.push(seconds + 's');
  return tmp.join(' ');
}

/**
 * Format account penalty
 * @param {String | Number} reason penalty reason
 * @param {Number} seconds Seconds left
 * @returns {String}
 */
function formatPenalty(reason, seconds) {
  if (reason === 0) {
    return '-';
  }
  if (seconds == -1) {
    return reason;
  }
  if (Date.now() > seconds * 1000 || new Date(seconds * 1000).getFullYear() - new Date().getFullYear() > 100) {
    return reason + ' - Expired';
  }
  return reason + ' - ' + countdown(seconds - Math.floor(Date.now() / 1000));
}

// credit: https://stackoverflow.com/a/11868398/5861427
/**
 * Calculates the text color for a given background color based on brightness
 * @param {String} color the background color
 * @returns {'black' | 'white'} text color
 */
 function getContrastYIQ(color){
  color = color.trim().replace('#', '');
  var r = parseInt(color.substr(0,2),16);
  var g = parseInt(color.substr(2,2),16);
  var b = parseInt(color.substr(4,2),16);
  var yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? 'black' : 'white';
}

/**
 * Create a pill badge
 * @param {String} text Text to be displayed
 * @param {String} color Color of the badge
 * @returns {Element}
 */
function createBadge(text, color) {
  let newBadge = document.querySelector('#badge-template').content.cloneNode(true);
  let span = newBadge.querySelector('span');
  span.innerText = text;
  span.style.backgroundColor = color;
  span.style.color = getContrastYIQ(color);
  return newBadge;
}

/**
 * show a toast message
 * @param {String} text text to show
 * @param {String} color bs color
 */
function showToast(text, color) {
  let newToast = document.querySelector('#toast-template').content.cloneNode(true);
  let body = newToast.querySelector('.toast-body');
  body.innerText = text;
  body.classList.add('bg-' + color);
  let fg = 'white';
  switch(color) {
    case 'warning':
    case 'info':
    case 'light':
    case 'body':
    case 'white':
    case 'transparent':
      fg = 'dark';
      break;
  }
  body.classList.add('text-' + fg);
  let toast_div = newToast.querySelector('.toast');

  document.querySelector('.toast-container').appendChild(newToast);
  
  toast_div.addEventListener('hidden.bs.toast', () => {
    toast_div.remove();
  })
  let toast = new bootstrap.Toast(toast_div, {
    delay: 2000
  });
  toast.show();
}

/**
 * @param {String} name tag name
 * @param {String} color tag color
 * @returns {Element} new line
 */
function createTagEdit(name, color = '#000000') {
  let new_line = document.querySelector('#settings-tags-template').content.cloneNode(true).querySelector('.row');
  new_line.id = 'tag-edit-' + name;
  new_line.querySelector('input[type=text]').value = name;
  new_line.querySelector('input[type=color]').value = color;
  new_line.querySelector('button').addEventListener('click', e => {
    e.preventDefault();
    new_line.remove();
  });
  return new_line;
}

/**
 * Called when a new table row is created
 * @callback createCallback
 * @param {Element} tr newly created table row 
 */

/**
 * Tries to find and creates if not found a table row corresponding to an account
 * @param {String} login login
 * @param {createCallback} createCallback
 * @returns {Element} table row
 */
function FindOrCreateRow(login, createCallback) {
  let table_body = document.querySelector('#main-table tbody');

  let tr = document.getElementById('acc-' + login);
  if (!tr) {
    let template = document.querySelector('#row-template');
    tr = template.content.cloneNode(true).querySelector('tr');
    tr.id = 'acc-' + login;
    tr.querySelector('td.login').innerText = login;
    tr.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el, { trigger: 'hover' }));

    if (createCallback) {
      createCallback(tr);
    }

    table_body.appendChild(tr);
  }
  return tr;
}

/**
 * Update row with new data
 * @param {Element} row the row to update
 * @param {String} login account login
 * @param {*} account account data
 * @param {Boolean} force force update
 */
function updateRow(row, login, account, force) {

  if (!equal(account_cache[login], account) || force) {
    account_cache[login] = account;

    row.className = account.pending ? 'pending' : '';

    row.querySelector('.steam_name').innerText = account.name ?? '?';
    let tags = row.querySelector('.tags')
    while (tags.firstChild) {
      tags.firstChild.remove();
    }
    if (account.tags) {
      account.tags.forEach(tag => {
        let color = tags_cache[tag];
        if (!color) {
          color = '#000000';
        }
        let badge = createBadge(tag, color);
        tags.appendChild(badge);
      });
    }
    row.querySelector('.level').innerText = account.lvl ?? '?';
    row.querySelector('.prime img').className = account.steamid ? account.prime ? 'prime-green' : 'prime-red' : '';
  
    row.querySelector('.ranks .mm').src = getRankImage(account.rank ?? 0, account.wins ?? 0, 'mm');
    row.querySelector('.ranks .wg').src = getRankImage(account.rank_wg ?? 0, account.wins_wg ?? 0, 'wg');
    row.querySelector('.ranks .dz').src = getRankImage(account.rank_dz ?? 0, account.wins_dz, 'dz');
  
    row.querySelector('.ranks .mm').title = account.wins < 0 ? '?' :account.wins ?? '?';
    bootstrap.Tooltip.getInstance(row.querySelector('.ranks .mm'))._fixTitle();
    row.querySelector('.ranks .wg').title = account.wins_wg ?? '?';
    bootstrap.Tooltip.getInstance(row.querySelector('.ranks .wg'))._fixTitle();
    row.querySelector('.ranks .dz').title = account.wins_dz ?? '?';
    bootstrap.Tooltip.getInstance(row.querySelector('.ranks .dz'))._fixTitle();

    row.querySelector('.ban').innerText = account.error ?? formatPenalty(account.penalty_reason ?? '?', account.penalty_seconds ?? -1)

    let dis = account.steamid ? 'inline-block' : 'none';
    row.querySelector('.copy-code').style.display = dis;
    row.querySelector('.open-pofile').style.display = dis;

  }

  if (account.penalty_seconds > 0) {
    row.querySelector('.ban').innerText = account.error ?? formatPenalty(account.penalty_reason ?? '?', account.penalty_seconds ?? -1)
  }

}

var update_cycle = -1;
/**
 * Updates all displayed information
 * @param {Boolean} force force update
 */
async function updateAccounts(force = false) {
  clearTimeout(update_cycle);
  tags_cache = await ipcRenderer.invoke('settings:get', 'tags');
  const accounts = await ipcRenderer.invoke('accounts:get');
  for (const login in accounts) {
    const account = accounts[login];

    let row = FindOrCreateRow(login, tr => {
      tr.querySelector('.copy-code').addEventListener('click', e => {
        e.preventDefault();
        clipboard.writeText(friendCode.encode(account.steamid), 'selection');
        showToast('Code copied to clipboard', 'success');
      });

      tr.querySelector('.copy-passwd').addEventListener('click', e => {
        e.preventDefault();
        clipboard.writeText(account.password, 'selection');
        showToast('Password copied to clipboard', 'success');
      });

      tr.querySelector('.open-pofile').addEventListener('click', e => {
        e.preventDefault();
        shell.openExternal('https://steamcommunity.com/profiles/' + account.steamid);
      });

      tr.querySelector('.refresh').addEventListener('click', async e => {
        e.preventDefault();
        let promise = ipcRenderer.invoke('accounts:check', login);
        updateAccounts();
        let ret = await promise;
        if(ret.error) {
          showToast(login + ': ' + ret.error, 'danger');
        }
        updateAccounts();
      });
      tr.querySelector('.delete').addEventListener('click', async e => {
        e.preventDefault();
        if(e.ctrlKey) {
          await ipcRenderer.invoke('accounts:delete', login);
          updateAccounts();
          tr.remove();
        } else {
          let modal_div = document.querySelector('#confirmDeleteAccount');
          modal_div.querySelector('input[name=login]').value = login;
          bootstrap.Modal.getInstance(modal_div).show();
        }
      });

      tr.querySelector('.edit').addEventListener('click', async e => {
        e.preventDefault();
        bootstrap.Modal.getInstance(document.querySelector('#editAccountModal')).show(login);
      });
    });

    updateRow(row, login, account, force);

  }
  update_cycle = setTimeout(updateAccounts, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    new bootstrap.Tooltip(el, { trigger: 'hover' });
  });

  let deleteConfirmationModal_div = document.querySelector('#confirmDeleteAccount');
  let deleteConfirmationModal = new bootstrap.Modal(deleteConfirmationModal_div);
  deleteConfirmationModal_div.querySelector('button.btn.btn-danger').addEventListener('click', async () => {
    deleteConfirmationModal.hide();
    let login = deleteConfirmationModal_div.querySelector('input[name=login]').value;
    if (login) {
      await ipcRenderer.invoke('accounts:delete', login);
      updateAccounts();
      document.querySelector('#acc-' + login).remove();
    }
  });

  let editAccountModal_div = document.querySelector('#editAccountModal');
  let editAccountModal = new bootstrap.Modal(editAccountModal_div);
  
  editAccountModal_div.addEventListener('show.bs.modal', async e => {
    //hide password by default
    editAccountModal_div.querySelector('.showHidePassword input').setAttribute('type', 'password');
    editAccountModal_div.querySelector('.showHidePassword i').innerText = 'visibility_off';

    let title = editAccountModal_div.querySelector('.modal-title');
    let username = editAccountModal_div.querySelector('#user-name');
    let password = editAccountModal_div.querySelector('#user-passwd');
    let tags = editAccountModal_div.querySelector('#user-tags');

    await ipcRenderer.invoke('settings:get', 'tags').then(new_tags => {
      while (tags.firstChild) {
        tags.firstChild.remove();
      }

      let def_option = document.createElement('option');
      def_option.value = '-- no tags --';
      def_option.innerText = '-- no tags --';
      tags.appendChild(def_option);

      for (const tag in new_tags) {
        const color = new_tags[tag];
        let option = document.createElement('option');
        option.value = tag;
        option.innerText = tag;
        option.style.color = color;
        tags.appendChild(option);
      }
    });
    tags.querySelectorAll('option').forEach(opt => opt.selected = false);

    if (!e.relatedTarget) {
      title.innerText = 'Add new account';
      username.value = '';
      username.disabled = false;
      password.value = '';
    } else {
      let login = e.relatedTarget;
      let account = account_cache[login];
      
      title.innerText = 'Edit account';
      username.value = login;
      username.disabled = true;
      password.value = account.password;
      (account.tags ?? []).forEach(tag => {
        let opt = tags.querySelector('option[value="' + tag + '"]');
        if (!opt) {
          opt = document.createElement('option');
          opt.value = tag;
          opt.innerText = tag;
          tags.appendChild(opt);
        }
        opt.selected = true;
      });
      if (tags.querySelectorAll('option:checked').length == 0) {
        tags.querySelector('option[value="-- no tags --"]').selected = true;
      }
    }
  });

  document.querySelector('#new-account').addEventListener('click', () => {
    editAccountModal.show();
  });

  document.querySelectorAll('.showHidePassword').forEach(elem => {
    let input = elem.querySelector('input');
    let icon = elem.querySelector('i');
    elem.querySelector('a').addEventListener('click', e => {
      e.preventDefault();
      if (input.getAttribute('type') == 'text') {
        input.setAttribute('type', 'password');
        icon.innerText = 'visibility_off';
      } else {
        input.setAttribute('type', 'text');
        icon.innerText = 'visibility';
      }
    });
  });

  editAccountModal_div.querySelector('button.btn.btn-primary').addEventListener('click', async e => {
    e.preventDefault();
    editAccountModal.hide();

    let username = editAccountModal_div.querySelector('#user-name');
    let password = editAccountModal_div.querySelector('#user-passwd');
    let tags = editAccountModal_div.querySelector('#user-tags');
    let tag_values = [...tags.selectedOptions].map(x => x.value).filter(x => x != '-- no tags --');
 
    if (!username.disabled) { //if login is enabled then we are adding new account
      await ipcRenderer.invoke('accounts:add', username.value, password.value);
      await ipcRenderer.invoke('accounts:update', username, {
        tags: tag_values
      });
      let ret = ipcRenderer.invoke('accounts:check', username.value);
      updateAccounts();
      ret = await ret;
      if(ret.error) {
        showToast(username.value + ': ' + ret.error, 'danger');
      }
      updateAccounts();
    } else {
      await ipcRenderer.invoke('accounts:update', username.value, {
        password: password.value,
        tags: tag_values
      });
      updateAccounts();
    }
  });

  let steamGuardModal_div = document.querySelector('#steamGuardModal');
  let steamGuardModal = new bootstrap.Modal(steamGuardModal_div);

  steamGuardModal_div.addEventListener('show.bs.modal', () => {
    steamGuardModal_div.querySelector('#steam-guard').value = '';
  })

  let code_sent = false;
  steamGuardModal_div.addEventListener('hide.bs.modal', e => {
    if (!code_sent) {
      ipcRenderer.send('steam:steamguard:response', null);
    }
    code_sent = false;
  })

  steamGuardModal_div.querySelector('button.btn.btn-primary').addEventListener('click', async e => {
    e.preventDefault();
    let code = steamGuardModal_div.querySelector('#steam-guard').value.trim();
    ipcRenderer.send('steam:steamguard:response', code.length == 0 ? null : code);
    code_sent = true;
    steamGuardModal.hide();
  })
  
  ipcRenderer.on('steam:steamguard', (_, username) => {
    steamGuardModal_div.querySelector('#steam-guard-username').innerText = username;
    steamGuardModal.show();
  });

  document.querySelector('#import').addEventListener('click', async e => {
    e.preventDefault();
    await ipcRenderer.invoke('accounts:import');
  });

  document.querySelector('#export').addEventListener('click', async e => {
    e.preventDefault();
    await ipcRenderer.invoke('accounts:export');
  });

  ipcRenderer.on('update:available', _ => {
    showToast('Update available, downloading...', 'success');
  })
  ipcRenderer.on('update:downloaded', _ => {
    showToast('Update downloaded, restart the program to update', 'success');
    document.title += " (Update available)";
  })

  document.querySelector('#reloadall').addEventListener('click', async e => {
    const accounts = await ipcRenderer.invoke('accounts:get');
    for (const login in accounts) {
      if (Object.hasOwnProperty.call(accounts, login)) {
        ipcRenderer.invoke('accounts:check', login).then(ret => {
          if(ret.error) {
            showToast(login + ': ' + ret.error, 'danger');
          }
        });
        await new Promise(p => setTimeout(p, 200));
      }
    }
    updateAccounts();
  });

  let settingsModal_div = document.querySelector('#settingsModal');
  let settingsModal = new bootstrap.Modal(settingsModal_div);

  settingsModal_div.addEventListener('show.bs.modal', async () => {
    let tag_list = settingsModal_div.querySelector('#tag-list');
    
    tags_cache = await ipcRenderer.invoke('settings:get', 'tags');
    
    while (tag_list.firstChild) {
      tag_list.firstChild.remove();
    }
    for (const tag in tags_cache) {
      tag_list.appendChild(createTagEdit(tag, tags_cache[tag]));
    }
  })

  settingsModal_div.querySelector('#new-tag-btn').addEventListener('click', e => {
    e.preventDefault();
    let new_name = settingsModal_div.querySelector('#new-tag').value.trim();
    if (new_name.length != 0 && document.getElementById('tag-edit-' + new_name) == null) {
      settingsModal_div.querySelector('#tag-list').appendChild(createTagEdit(new_name));
      settingsModal_div.querySelector('#new-tag').value = '';
    }
  })

  settingsModal_div.querySelector('.modal-footer button.btn.btn-primary').addEventListener('click', async e => {
    e.preventDefault();
    let rows = settingsModal_div.querySelectorAll('#tag-list .row');
    let new_tags = Object.fromEntries([...rows].map(x => [x.querySelector('input[type=text]').value, x.querySelector('input[type=color]').value]));

    await ipcRenderer.invoke('settings:set', 'tags', new_tags);
    settingsModal.hide();
    updateAccounts(true);
  })

  document.querySelector('#settings').addEventListener('click', async e => {
    e.preventDefault();
    settingsModal.show();
  });
  
  updateAccounts();

})