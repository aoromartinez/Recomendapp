const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

let win;
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const secretFields = ['lastfmApiKey', 'spotifyAccessToken', 'spotifyRefreshToken', 'soundcloudClientSecret', 'soundcloudAccessToken', 'soundcloudRefreshToken'];
const encrypt = value => safeStorage.isEncryptionAvailable() && value ? safeStorage.encryptString(value).toString('base64') : value;
const decrypt = value => { try { return safeStorage.isEncryptionAvailable() && value ? safeStorage.decryptString(Buffer.from(value, 'base64')) : value; } catch { return ''; } };
const writeConfig = value => {
  const stored = {...value, _protected: safeStorage.isEncryptionAvailable()};
  if (stored._protected) secretFields.forEach(field => { if (stored[field]) stored[field] = encrypt(stored[field]); });
  fs.writeFileSync(configPath(), JSON.stringify(stored, null, 2));
};
const readConfig = () => {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (stored._protected) secretFields.forEach(field => { if (stored[field]) stored[field] = decrypt(stored[field]); });
    else if (safeStorage.isEncryptionAvailable() && secretFields.some(field => stored[field])) writeConfig(stored);
    delete stored._protected;
    return stored;
  } catch { return {}; }
};

function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 900, minHeight: 650, backgroundColor: '#f2efe8', titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return {action:'deny'}; });
  win.loadFile('index.html');
}
async function setupUpdates(){
  if(!app.isPackaged)return;
  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.on('update-available',async info=>{const choice=await dialog.showMessageBox(win,{type:'info',title:'Nueva versión disponible',message:`Recomendapp ${info.version} está disponible`,detail:'Puedes descargarla ahora y continuar usando la app mientras termina.',buttons:['Descargar actualización','Más tarde'],defaultId:0,cancelId:1});if(choice.response===0)autoUpdater.downloadUpdate();});
  autoUpdater.on('download-progress',progress=>win?.setProgressBar(progress.percent/100));
  autoUpdater.on('update-downloaded',async info=>{win?.setProgressBar(-1);const choice=await dialog.showMessageBox(win,{type:'info',title:'Actualización lista',message:`Recomendapp ${info.version} está lista para instalar`,detail:'La app se cerrará, instalará la actualización y volverá a abrirse.',buttons:['Reiniciar e instalar','Instalar al cerrar'],defaultId:0,cancelId:1});if(choice.response===0)autoUpdater.quitAndInstall(false,true);});
  autoUpdater.on('error',()=>win?.setProgressBar(-1));
  setTimeout(()=>autoUpdater.checkForUpdates().catch(()=>{}),5000);
}
app.whenReady().then(()=>{createWindow();setupUpdates();});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

ipcMain.handle('config:get', () => { const c=readConfig(); return { lastfmUser:c.lastfmUser||'', lastfmApiKey:c.lastfmApiKey||'', spotifyClientId:c.spotifyClientId||'', spotifyConnected:!!c.spotifyRefreshToken, soundcloudClientId:c.soundcloudClientId||'', soundcloudClientSecret:c.soundcloudClientSecret||'', soundcloudConnected:!!c.soundcloudRefreshToken }; });
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('config:save', (_, incoming) => { const current={...readConfig(),...incoming};delete current.googleClientId;delete current.youtubeAccessToken;delete current.youtubeRefreshToken;delete current.youtubeExpiresAt;writeConfig(current);return true; });
ipcMain.handle('lastfm:request', async (_, method, params={}) => {
  const c=readConfig(); if(!c.lastfmUser||!c.lastfmApiKey) throw new Error('Configura tu usuario y API key de Last.fm.');
  const q=new URLSearchParams({method,user:c.lastfmUser,api_key:c.lastfmApiKey,format:'json',...params});
  const res=await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`); const data=await res.json(); if(!res.ok||data.error) throw new Error(data.message||'Last.fm no respondió.'); return data;
});
const b64url = value => value.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
async function spotifyToken(body){ const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}); const data=await res.json(); if(!res.ok) throw new Error(data.error_description||'No se pudo conectar con Spotify.'); return data; }
ipcMain.handle('spotify:connect', async () => {
  const c=readConfig(); if(!c.spotifyClientId) throw new Error('Configura el Client ID de Spotify.');
  const redirect='http://127.0.0.1:43821/callback';
  const verifier=b64url(crypto.randomBytes(48)); const challenge=b64url(crypto.createHash('sha256').update(verifier).digest()); const state=b64url(crypto.randomBytes(18));
  return new Promise((resolve,reject)=>{ const server=http.createServer(async(req,res)=>{ try { const url=new URL(req.url,'http://127.0.0.1'); if(url.pathname!='/callback') return; if(url.searchParams.get('state')!==state) throw new Error('La respuesta de Spotify no es válida.'); const code=url.searchParams.get('code'); if(!code) throw new Error('Autorización cancelada.'); const tokens=await spotifyToken({client_id:c.spotifyClientId,grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier}); writeConfig({...readConfig(),spotifyAccessToken:tokens.access_token,spotifyRefreshToken:tokens.refresh_token,spotifyExpiresAt:Date.now()+tokens.expires_in*1000}); res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<body style="font-family:sans-serif;text-align:center;padding:80px"><h1>Spotify conectado</h1><p>Ya puedes cerrar esta ventana y volver a Recomendapp.</p></body>');server.close();resolve(true); } catch(e){res.writeHead(400);res.end(e.message);server.close();reject(e);} }); server.on('error',()=>reject(new Error('El puerto local 43821 está ocupado. Cierra otras instancias de Recomendapp.'))); server.listen(43821,'127.0.0.1',()=>{ const q=new URLSearchParams({client_id:c.spotifyClientId,response_type:'code',redirect_uri:redirect,scope:'user-top-read user-read-recently-played playlist-read-private playlist-read-collaborative playlist-modify-private',code_challenge_method:'S256',code_challenge:challenge,state}); shell.openExternal(`https://accounts.spotify.com/authorize?${q}`); }); setTimeout(()=>{server.close();reject(new Error('La autorización tardó demasiado.'));},180000); });
});
async function accessToken(){ let c=readConfig(); if(!c.spotifyRefreshToken) throw new Error('Conecta Spotify primero.'); if(c.spotifyAccessToken&&Date.now()<c.spotifyExpiresAt-60000)return c.spotifyAccessToken; const t=await spotifyToken({client_id:c.spotifyClientId,grant_type:'refresh_token',refresh_token:c.spotifyRefreshToken}); c={...c,spotifyAccessToken:t.access_token,spotifyRefreshToken:t.refresh_token||c.spotifyRefreshToken,spotifyExpiresAt:Date.now()+t.expires_in*1000};writeConfig(c);return t.access_token; }
const spotifyRequestGroups=new Map();
const spotifyGroup=key=>{if(!spotifyRequestGroups.has(key))spotifyRequestGroups.set(key,{cancelled:false,controllers:new Set(),waits:new Map()});return spotifyRequestGroups.get(key);};
const cancellableWait=(ms,group)=>new Promise((resolve,reject)=>{if(group?.cancelled)return reject(new Error('SPOTIFY_CANCELLED'));const timer=setTimeout(()=>{group?.waits.delete(timer);resolve();},ms);group?.waits.set(timer,reject);});
ipcMain.handle('spotify:cancel',(_,key='default')=>{const group=spotifyRequestGroups.get(key);if(!group)return true;group.cancelled=true;for(const controller of group.controllers)controller.abort();for(const [timer,reject] of group.waits){clearTimeout(timer);reject(new Error('SPOTIFY_CANCELLED'));}group.waits.clear();spotifyRequestGroups.delete(key);return true;});
ipcMain.handle('spotify:request',async(_,endpoint,options={})=>{const token=await accessToken();const groupKey=options.requestGroup;const group=groupKey?spotifyGroup(groupKey):null;if(group?.cancelled)throw new Error('SPOTIFY_CANCELLED');let timeoutRetries=0;try{for(let attempt=0;attempt<7;attempt++){if(group?.cancelled)throw new Error('SPOTIFY_CANCELLED');const controller=new AbortController();group?.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),options.timeoutMs||20000);let res;try{res=await fetch(`https://api.spotify.com/v1${endpoint}`,{method:options.method||'GET',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:controller.signal});}catch(error){if(group?.cancelled)throw new Error('SPOTIFY_CANCELLED');if(error.name==='AbortError'&&timeoutRetries++<1){win?.webContents.send('spotify:request-timeout',{attempt:timeoutRetries});continue;}if(error.name==='AbortError')throw new Error('SPOTIFY_TIMEOUT');throw error;}finally{clearTimeout(timer);group?.controllers.delete(controller);}if(res.status===429&&attempt<6){const wait=Math.max(1,Number(res.headers.get('retry-after')||2));win?.webContents.send('spotify:rate-limit',{seconds:wait,attempt:attempt+1});await cancellableWait(wait*1000,group);continue;}const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!res.ok)throw new Error(data.error?.message||`Spotify respondió ${res.status}.`);return data;}throw new Error('Spotify limitó temporalmente las solicitudes. Intenta de nuevo.');}finally{if(groupKey&&group&&!group.controllers.size&&!group.waits.size)spotifyRequestGroups.delete(groupKey);}});

async function soundcloudToken(body){const res=await fetch('https://secure.soundcloud.com/oauth/token',{method:'POST',headers:{Accept:'application/json; charset=utf-8','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});const data=await res.json();if(!res.ok)throw new Error(data.error_description||data.error||'No se pudo conectar con SoundCloud.');return data;}
ipcMain.handle('soundcloud:connect',async()=>{const c=readConfig();if(!c.soundcloudClientId||!c.soundcloudClientSecret)throw new Error('Configura el Client ID y Client secret de SoundCloud primero.');const redirect='http://127.0.0.1:43822/callback';const verifier=b64url(crypto.randomBytes(48));const challenge=b64url(crypto.createHash('sha256').update(verifier).digest());const state=b64url(crypto.randomBytes(18));return new Promise((resolve,reject)=>{let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;server.close();error?reject(error):resolve(value);};const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname!='/callback')return;if(url.searchParams.get('state')!==state)throw new Error('La respuesta de SoundCloud no es válida.');const code=url.searchParams.get('code');if(!code)throw new Error('Autorización cancelada.');const tokens=await soundcloudToken({client_id:c.soundcloudClientId,client_secret:c.soundcloudClientSecret,grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier});writeConfig({...readConfig(),soundcloudAccessToken:tokens.access_token,soundcloudRefreshToken:tokens.refresh_token,soundcloudExpiresAt:Date.now()+tokens.expires_in*1000});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<body style="font-family:sans-serif;text-align:center;padding:80px"><h1>SoundCloud conectado</h1><p>Ya puedes cerrar esta ventana y volver a Recomendapp.</p></body>');finish(null,true);}catch(error){res.writeHead(400);res.end(error.message);finish(error);}});server.on('error',()=>finish(new Error('El puerto local 43822 está ocupado. Cierra otras instancias de Recomendapp.')));server.listen(43822,'127.0.0.1',()=>{const q=new URLSearchParams({client_id:c.soundcloudClientId,response_type:'code',redirect_uri:redirect,code_challenge_method:'S256',code_challenge:challenge,state});shell.openExternal(`https://secure.soundcloud.com/authorize?${q}`);});setTimeout(()=>finish(new Error('La autorización de SoundCloud tardó demasiado.')),180000);});});
async function soundcloudAccessToken(){let c=readConfig();if(!c.soundcloudRefreshToken)throw new Error('Conecta tu cuenta de SoundCloud primero.');if(c.soundcloudAccessToken&&Date.now()<c.soundcloudExpiresAt-60000)return c.soundcloudAccessToken;const token=await soundcloudToken({client_id:c.soundcloudClientId,client_secret:c.soundcloudClientSecret,grant_type:'refresh_token',refresh_token:c.soundcloudRefreshToken});c={...c,soundcloudAccessToken:token.access_token,soundcloudRefreshToken:token.refresh_token,soundcloudExpiresAt:Date.now()+token.expires_in*1000};writeConfig(c);return token.access_token;}
const soundcloudControllers=new Set();
ipcMain.handle('soundcloud:cancel',()=>{for(const controller of soundcloudControllers)controller.abort();soundcloudControllers.clear();return true;});
ipcMain.handle('soundcloud:request',async(_,endpoint,options={})=>{const token=await soundcloudAccessToken();const controller=new AbortController();soundcloudControllers.add(controller);const timer=setTimeout(()=>controller.abort(),options.timeoutMs||20000);try{const res=await fetch(`https://api.soundcloud.com${endpoint}`,{method:options.method||'GET',headers:{Accept:'application/json; charset=utf-8',Authorization:`OAuth ${token}`,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:controller.signal});const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!res.ok)throw new Error(data.error?.message||data.error||data.message||`SoundCloud respondió ${res.status}.`);return data;}catch(error){if(error.name==='AbortError')throw new Error('SOUNDCLOUD_CANCELLED');throw error;}finally{clearTimeout(timer);soundcloudControllers.delete(controller);}});
