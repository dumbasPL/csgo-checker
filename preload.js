const { contextBridge, ipcRenderer, clipboard, shell } = require("electron");
const equal = require('fast-deep-equal');
const friendCode = require("csgo-friendcode");
var showdown = require('showdown');
const md_converter = new showdown.Converter();

contextBridge.exposeInMainWorld("ipcRenderer", {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel, func) => {
    ipcRenderer.on(channel, (...args) => func(...args));
  },
  invoke: (chanel, ...args) => {
    return ipcRenderer.invoke(chanel, ...args);
  }
});

contextBridge.exposeInMainWorld('fastEqual', {
  equal: (...args) => equal(...args)
});

contextBridge.exposeInMainWorld('friendCode', {
  encode: (steamId) => friendCode.encode(steamId)
});

contextBridge.exposeInMainWorld('clipboard', {
  writeText: (text, type) => clipboard.writeText(text, type)
});

contextBridge.exposeInMainWorld('shell', {
  openExternal: (url, options) => shell.openExternal(url, options)
});

contextBridge.exposeInMainWorld('md_converter', {
  makeHtml: (markdown) => md_converter.makeHtml(markdown)
});