import { contextBridge, ipcRenderer, clipboard, shell } from "electron";
import { encode as _encode } from "csgo-friendcode";
import { Converter } from 'showdown';

const md_converter = new Converter();

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

contextBridge.exposeInMainWorld('friendCode', {
  encode: (steamId) => _encode(steamId)
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