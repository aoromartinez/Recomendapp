const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('musicAPI', {
  version:()=>ipcRenderer.invoke('app:version'),
  getConfig:()=>ipcRenderer.invoke('config:get'), saveConfig:value=>ipcRenderer.invoke('config:save',value),
  lastfm:(method,params)=>ipcRenderer.invoke('lastfm:request',method,params),
  connectSpotify:()=>ipcRenderer.invoke('spotify:connect'), spotify:(endpoint,options)=>ipcRenderer.invoke('spotify:request',endpoint,options),
  cancelSpotify:group=>ipcRenderer.invoke('spotify:cancel',group),
  connectYouTube:()=>ipcRenderer.invoke('youtube:connect'), youtube:(endpoint,options)=>ipcRenderer.invoke('youtube:request',endpoint,options), cancelYouTube:()=>ipcRenderer.invoke('youtube:cancel'),
  minimize:()=>ipcRenderer.invoke('window:minimize'), maximize:()=>ipcRenderer.invoke('window:maximize'), close:()=>ipcRenderer.invoke('window:close'), setProcessActive:active=>ipcRenderer.invoke('process:active',active),
  libraryCreate:(name,source,tracks)=>ipcRenderer.invoke('library:create',name,source,tracks), libraryAddTracks:(id,tracks)=>ipcRenderer.invoke('library:add-tracks',id,tracks), libraryList:()=>ipcRenderer.invoke('library:list'), libraryGet:id=>ipcRenderer.invoke('library:get',id), libraryUpdateTrack:(id,changes)=>ipcRenderer.invoke('library:update-track',id,changes), libraryUpdatePlaylist:(id,changes)=>ipcRenderer.invoke('library:update-playlist',id,changes), libraryRetry:id=>ipcRenderer.invoke('library:retry',id),
  onSpotifyRateLimit:callback=>ipcRenderer.on('spotify:rate-limit',(_,data)=>callback(data)),
  onSpotifyTimeout:callback=>ipcRenderer.on('spotify:request-timeout',(_,data)=>callback(data))
});
