const { app, BrowserWindow, Tray, Menu, screen, globalShortcut, net, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) app.exit(0);

// ---------- settings ----------
const DEFAULTS = {
  // text
  font: 'sf', weight: 700, italic: false, caseMode: 'lower', tracking: -2,
  // growing
  minSize: 5, maxSize: 24, sizeByDuration: true, refDur: 1.4, growMode: 'word', curve: 'easeOut',
  // color
  textMode: 'solid', textColor: '#ffffff', bgGradient: true, bg1: '#000000', bg2: '#1b1140', bgAngle: 160, glow: 25,
  // animation
  enter: 'pop', enterMs: 380, exit: 'blur', exitMs: 320, tilt: 0, holdMs: 1500,
  // layout
  vOffset: -4, align: 'center', showLine: false, lineSize: 2.4, lineOpacity: 35,
  showFooter: true, showHint: true, showProgress: true,
  // sync + app
  nudge: 0, displays: 'primary', startAtLogin: false
};
let settings = { ...DEFAULTS };
let firstRun = false;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    for (const k of Object.keys(DEFAULTS)) if (typeof raw[k] === typeof DEFAULTS[k]) settings[k] = raw[k];
  } catch { firstRun = true; }
}
let saveTimer = null;
function writeSettings() {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {}
}
function saveSettings() { clearTimeout(saveTimer); saveTimer = setTimeout(writeSettings, 300); }

// ---------- state ----------
let tray = null;
let wins = [];
let settingsWin = null;
let shown = false;       // overlay open
let playing = false;
let visibleNow = false;
let track = { key: '', title: '', artist: '', state: 'idle', lines: [], dur: 0 };
const cache = new Map();

const pubTrack = () => ({ key: track.key, title: track.title, artist: track.artist, state: track.state, lines: track.lines, dur: track.dur });

// ---------- overlay windows ----------
const targetDisplays = () => (settings.displays === 'all' ? screen.getAllDisplays() : [screen.getPrimaryDisplay()]);

function send(channel, data) {
  wins.forEach((w) => { if (!w.isDestroyed()) w.webContents.send(channel, data); });
}
function broadcastSettings() {
  send('settings', settings);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings', settings);
}

function showWin(w) {
  if (w.isDestroyed()) return;
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setFullScreen(true);
  w.show();
  w.focus();
}

function buildWindows() {
  wins.forEach((w) => { try { w.destroy(); } catch {} });
  wins = [];
  for (const d of targetDisplays()) {
    const w = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, resizable: false, movable: false, hasShadow: false,
      skipTaskbar: true, alwaysOnTop: true, fullscreen: true, show: false, backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(path.join(__dirname, 'overlay.html'));
    w.webContents.on('did-finish-load', () => {
      w.webContents.send('init', { settings, track: pubTrack(), playing });
      if (visibleNow) { showWin(w); w.webContents.send('vis', true); }
    });
    wins.push(w);
  }
}

function closeOverlay() { shown = false; updateVisibility(); buildMenu(); }

function updateVisibility() {
  const want = shown;
  if (want === visibleNow) return;
  visibleNow = want;
  if (want) {
    try { globalShortcut.register('Escape', closeOverlay); } catch {}
    wins.forEach(showWin);
    send('vis', true);
  } else {
    try { globalShortcut.unregister('Escape'); } catch {}
    send('vis', false);
    const ws = wins.slice();
    setTimeout(() => { if (!visibleNow) ws.forEach((w) => { if (!w.isDestroyed()) w.hide(); }); }, 450);
  }
}

function toggleShown() { shown = !shown; updateVisibility(); buildMenu(); }

// ---------- settings window ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1120, height: 780, minWidth: 880, minHeight: 600, title: 'Wordlight settings',
    backgroundColor: '#0e0c18', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function applyPatch(patch) {
  let rebuild = false, login = false;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS) || typeof v !== typeof DEFAULTS[k]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    if (settings[k] === v) continue;
    settings[k] = v;
    if (k === 'displays') rebuild = true;
    if (k === 'startAtLogin') login = true;
  }
  saveSettings();
  if (rebuild) buildWindows();
  if (login) app.setLoginItemSettings({ openAtLogin: settings.startAtLogin });
  broadcastSettings();
  buildMenu();
}

ipcMain.handle('get-settings', () => settings);
ipcMain.on('set-settings', (_e, patch) => applyPatch(patch));
ipcMain.on('reset-settings', () => applyPatch({ ...DEFAULTS }));
ipcMain.on('close', closeOverlay);

// ---------- tray ----------
function buildMenu() {
  if (!tray) return;
  const nowLabel = track.title ? `${track.artist} – ${track.title}` : 'Nothing playing';
  const status = { ready: 'Synced lyrics found', loading: 'Finding lyrics…', none: 'No synced lyrics found', instrumental: 'Instrumental', idle: '' }[track.state] || '';
  const nudge = (v) => applyPatch({ nudge: Math.max(-2000, Math.min(2000, Math.round(v))) });

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nowLabel.length > 60 ? nowLabel.slice(0, 57) + '…' : nowLabel, enabled: false },
    ...(status ? [{ label: status, enabled: false }] : []),
    { type: 'separator' },
    { label: 'Show lyrics fullscreen', type: 'checkbox', checked: shown, accelerator: 'Ctrl+Alt+L', registerAccelerator: false, click: toggleShown },
    { label: 'Full lyric line at the bottom', type: 'checkbox', checked: settings.showLine, click: (i) => applyPatch({ showLine: i.checked }) },
    { label: 'Settings…', click: openSettings },
    { label: 'Lyrics timing', submenu: [
      { label: `Offset: ${settings.nudge >= 0 ? '+' : ''}${settings.nudge} ms`, enabled: false },
      { label: 'Lyrics earlier (+100 ms)', click: () => nudge(settings.nudge + 100) },
      { label: 'Lyrics later (−100 ms)', click: () => nudge(settings.nudge - 100) },
      { label: 'Reset', click: () => nudge(0) }
    ] },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: settings.startAtLogin, click: (i) => applyPatch({ startAtLogin: i.checked }) },
    { label: 'Quit Wordlight', click: () => app.quit() }
  ]));
  tray.setToolTip(`Wordlight – ${nowLabel}`);
}

// ---------- lyrics ----------
const cleanTitle = (s) => (s || '')
  .replace(/\s*[\(\[][^\)\]]*(feat|ft\.|remaster|live|version|edit|mix|deluxe)[^\)\]]*[\)\]]/ig, '')
  .replace(/\s+-\s+.*(remaster|live|version|edit|mix).*$/i, '')
  .trim();

async function getJson(url) {
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': 'Wordlight/1.0 (desktop lyrics overlay)' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchLyrics(tk, durMs) {
  const base = 'https://lrclib.net/api/';
  const t = encodeURIComponent(cleanTitle(tk.title));
  const a = encodeURIComponent((tk.artist || '').split(/,|&| feat\.? /i)[0].trim());
  const d = durMs > 0 ? `&duration=${Math.round(durMs / 1000)}` : '';
  let r = await getJson(`${base}get?artist_name=${a}&track_name=${t}${d}`);
  if (!r || (!r.syncedLyrics && !r.instrumental)) {
    const arr = await getJson(`${base}search?track_name=${t}&artist_name=${a}`);
    if (Array.isArray(arr)) r = arr.find((x) => x.syncedLyrics) || arr.find((x) => x.instrumental) || null;
  }
  return r;
}

// "[mm:ss.xx] text" -> lines with estimated per-word timings (ms)
function parseLrc(text) {
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const txt = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) entries.push({ t: Number(m[1]) * 60 + Number(m[2]), text: txt });
  }
  entries.sort((x, y) => x.t - y.t);
  const out = [];
  entries.forEach((e, i) => {
    if (!e.text) return;
    const next = entries[i + 1] ? entries[i + 1].t : e.t + 4;
    const gap = Math.max(0.3, next - e.t);
    const words = e.text.split(/\s+/);
    const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5);
    const total = weights.reduce((p, c) => p + c, 0);
    const sing = Math.min(gap * 0.94, Math.max(0.8, 0.3 + e.text.length * 0.075));
    let c = e.t;
    const w = words.map((word, k) => {
      const dur = (weights[k] / total) * sing;
      const item = [word, Math.round(c * 1000), Math.round((c + dur) * 1000)];
      c += dur;
      return item;
    });
    out.push({ s: Math.round(e.t * 1000), w });
  });
  return out;
}

async function loadLyrics(tk, durMs) {
  const apply = (res) => {
    if (track.key !== tk.key) return;
    if (!res) track.state = 'none';
    else if (res.instrumental) track.state = 'instrumental';
    else { track.lines = parseLrc(res.syncedLyrics || ''); track.state = track.lines.length ? 'ready' : 'none'; }
    send('track', pubTrack());
    buildMenu();
  };
  const hit = cache.get(tk.key);
  if (hit !== undefined) return apply(hit);
  const res = await fetchLyrics(tk, durMs);
  cache.set(tk.key, res || null);
  apply(res);
}

// ---------- Windows media session poller ----------
let ps = null;
function startPoller() {
  const dest = path.join(app.getPath('userData'), 'smtc.ps1');
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fs.readFileSync(path.join(__dirname, 'smtc.ps1')));
  } catch (e) { console.error('Could not prepare smtc.ps1', e); return; }

  ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', dest], { windowsHide: true });
  let buf = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onSample(JSON.parse(line)); } catch {}
    }
  });
  ps.on('error', () => {});
  ps.on('exit', () => { ps = null; if (!app.isQuitting) setTimeout(startPoller, 2000); });
}

function onSample(s) {
  playing = s.status === 'Playing';
  const key = s.title ? `${s.artist || ''}|${s.title}` : '';
  if (key !== track.key) {
    track = { key, title: s.title || '', artist: s.artist || '', state: key ? 'loading' : 'idle', lines: [], dur: s.end || 0 };
    send('track', pubTrack());
    buildMenu();
    if (key) loadLyrics({ ...track }, s.end);
  }
  if (s.end > 0) track.dur = s.end;
  send('pos', { pos: s.pos || 0, playing, dur: s.end || 0 });
}

// ---------- app lifecycle ----------
app.on('window-all-closed', () => {});
app.on('before-quit', () => { app.isQuitting = true; writeSettings(); if (ps) try { ps.kill(); } catch {} });

app.whenReady().then(() => {
  if (process.platform !== 'win32') console.warn('Wordlight reads the Windows media session; media detection only works on Windows.');
  loadSettings();
  app.setLoginItemSettings({ openAtLogin: settings.startAtLogin });

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.on('click', toggleShown);
  buildMenu();
  buildWindows();
  screen.on('display-added', buildWindows);
  screen.on('display-removed', buildWindows);

  globalShortcut.register('Control+Alt+L', toggleShown);
  startPoller();

  if (firstRun && Notification.isSupported()) {
    new Notification({ title: 'Wordlight is running', body: 'Click the tray icon to open the lyrics fullscreen. Right-click it for Settings.' }).show();
    writeSettings();
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
