# Wordlight (Windows 10/11)

A tray app that shows the song you're playing as fullscreen lyrics where **each word grows the longer it is sung**.

## Run it

1. Install Node.js LTS from https://nodejs.org
2. In this folder, open a terminal and run `npm install`, then `npm start`.
   (If Electron complains it "failed to install correctly", run `node node_modules\electron\install.js` and try `npm start` again.)
3. A purple icon appears in the system tray (check the ^ overflow). Play a song in the **Spotify desktop app** or Apple Music for Windows, then **left-click the tray icon**.

## Build an installer

`npm run dist` (installer lands in `dist\`), or push the repo to GitHub and run the included workflow in the Actions tab.

## Controls

- **Left-click the tray icon** or **Ctrl+Alt+L**: open / close the fullscreen lyrics
- **Click anywhere or press Esc**: close
- **Right-click the tray icon**: Settings, quick timing offset, start with Windows, quit

## Settings (right-click the tray icon, then Settings…)

A live preview with demo words sits next to every option, and changes apply to the fullscreen overlay immediately.

- **Text**: font (bundled SF Pro Text Heavy, Segoe UI, Georgia, Cascadia Mono, Impact), weight, italic, letter case, letter spacing
- **Growing words**: start size, biggest size, "longer word = bigger", time to reach biggest, grow until the word ends or until the next word starts, growth curve
- **Colors**: one color / rainbow per word / match the song, background color or gradient (color, angle), glow
- **Animation**: 6 enter styles, 5 leave styles, speeds, random tilt, how long to wait before hiding after a pause
- **Layout**: left / center / right, move up or down, show the whole line below (size, brightness of unsung words), song title, progress bar, close hint
- **Sync and app**: timing offset, main display or all displays, start with Windows
- **Presets**: Midnight, Neon, Sunset, Paper, Terminal, Loud

## How it works

- `smtc.ps1` reads Windows' media session (Spotify, Apple Music, browsers...). Needs Windows 10 version 1809 or newer.
- Lyrics come from [LRCLIB](https://lrclib.net), a free community database with line-level timestamps. Per-word timing inside a line is **estimated** from word length, so use the timing offset if words feel early or late.
- The bundled font is `assets/fonts/sf-pro-text.ttf` (SF Pro Text Heavy, supplied by the project owner). Apple's license for SF fonts is restrictive, so keep this for personal use and don't publish the font in a public repository.

Settings are saved in `%APPDATA%\wordlight\settings.json`.
