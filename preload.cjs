const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('musicAPI', {
  version:()=>ipcRenderer.invoke('app:version'),
  getConfig:()=>ipcRenderer.invoke('config:get'), saveConfig:value=>ipcRenderer.invoke('config:save',value),
  lastfm:(method,params)=>ipcRenderer.invoke('lastfm:request',method,params),
  connectSpotify:()=>ipcRenderer.invoke('spotify:connect'), spotify:(endpoint,options)=>ipcRenderer.invoke('spotify:request',endpoint,options),
  onSpotifyRateLimit:callback=>ipcRenderer.on('spotify:rate-limit',(_,data)=>callback(data)),
  onSpotifyTimeout:callback=>ipcRenderer.on('spotify:request-timeout',(_,data)=>callback(data))
});
