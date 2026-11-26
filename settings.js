(async function () {
  const opt = (pairs) => pairs.map(([v, l]) => ({ v, l }));
  const SCHEMA = [
    { group: 'Text', items: [
      { k: 'font', label: 'Font', t: 'select', o: opt([['sf', 'SF Pro Text (bundled, Heavy)'], ['system', 'Segoe UI'], ['serif', 'Georgia'], ['mono', 'Cascadia Mono'], ['impact', 'Impact']]) },
      { k: 'weight', label: 'Weight', t: 'range', min: 300, max: 900, step: 100, fmt: (v) => v, offIf: (s) => s.font === 'sf' },
      { k: 'italic', label: 'Italic', t: 'check' },
      { k: 'caseMode', label: 'Letter case', t: 'select', o: opt([['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['asis', 'As written']]) },
      { k: 'tracking', label: 'Letter spacing', t: 'range', min: -8, max: 12, step: 1, fmt: (v) => v + '%' }
    ] },
    { group: 'Growing words', items: [
      { k: 'minSize', label: 'Start size', t: 'range', min: 2, max: 20, step: 0.5, fmt: (v) => v + '%' },
      { k: 'maxSize', label: 'Biggest size', t: 'range', min: 8, max: 40, step: 0.5, fmt: (v) => v + '%' },
      { k: 'sizeByDuration', label: 'Longer word = bigger', t: 'check' },
      { k: 'refDur', label: 'Time to reach biggest', t: 'range', min: 0.3, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) + 's', offIf: (s) => !s.sizeByDuration },
      { k: 'growMode', label: 'Keep growing', t: 'select', o: opt([['word', 'Until the word ends'], ['next', 'Until the next word starts']]) },
      { k: 'curve', label: 'Growth curve', t: 'select', o: opt([['easeOut', 'Fast then slow'], ['linear', 'Steady'], ['easeIn', 'Slow then fast'], ['easeInOut', 'Smooth S-curve'], ['spring', 'Springy overshoot']]) }
    ] },
    { group: 'Colors', items: [
      { k: 'textMode', label: 'Text colors', t: 'select', o: opt([['solid', 'One color'], ['rainbow', 'Rainbow, changes per word'], ['song', 'Match the song']]) },
      { k: 'textColor', label: 'Text color', t: 'color', offIf: (s) => s.textMode !== 'solid' },
      { k: 'bgGradient', label: 'Gradient background', t: 'check' },
      { k: 'bg1', label: 'Background color', t: 'color' },
      { k: 'bg2', label: 'Gradient end color', t: 'color', offIf: (s) => !s.bgGradient },
      { k: 'bgAngle', label: 'Gradient angle', t: 'range', min: 0, max: 360, step: 5, fmt: (v) => v + '°', offIf: (s) => !s.bgGradient },
      { k: 'glow', label: 'Glow', t: 'range', min: 0, max: 100, step: 1, fmt: (v) => v + '%' }
    ] },
    { group: 'Animation', items: [
      { k: 'enter', label: 'Word enters', t: 'select', o: opt([['pop', 'Pop'], ['fade', 'Fade'], ['slide', 'Slide up'], ['blur', 'Blur in'], ['zoom', 'Zoom in'], ['flip', 'Flip up'], ['none', 'None']]) },
      { k: 'enterMs', label: 'Enter speed', t: 'range', min: 0, max: 1000, step: 20, fmt: (v) => v + ' ms' },
      { k: 'exit', label: 'Word leaves', t: 'select', o: opt([['blur', 'Blur out'], ['fade', 'Fade'], ['fly', 'Fly up'], ['shrink', 'Shrink'], ['explode', 'Burst'], ['none', 'None']]) },
      { k: 'exitMs', label: 'Leave speed', t: 'range', min: 0, max: 1000, step: 20, fmt: (v) => v + ' ms' },
      { k: 'tilt', label: 'Random tilt', t: 'range', min: 0, max: 15, step: 1, fmt: (v) => v + '°' },
      { k: 'holdMs', label: 'Hide after a pause of', t: 'range', min: 0, max: 4000, step: 100, fmt: (v) => (v / 1000).toFixed(1) + 's' }
    ] },
    { group: 'Layout', items: [
      { k: 'showLine', label: 'Full lyric line at the bottom', t: 'check' },
      { k: 'align', label: 'Word position', t: 'select', o: opt([['center', 'Center'], ['left', 'Left'], ['right', 'Right']]) },
      { k: 'vOffset', label: 'Move up / down', t: 'range', min: -35, max: 35, step: 1, fmt: (v) => v },
      { k: 'lineSize', label: 'Line text size', t: 'range', min: 1, max: 5, step: 0.1, fmt: (v) => v.toFixed(1), offIf: (s) => !s.showLine },
      { k: 'lineOpacity', label: 'Unsung words brightness', t: 'range', min: 0, max: 100, step: 5, fmt: (v) => v + '%', offIf: (s) => !s.showLine },
      { k: 'showFooter', label: 'Show song title', t: 'check' },
      { k: 'showProgress', label: 'Show progress bar', t: 'check' },
      { k: 'showHint', label: 'Show "click to close" hint', t: 'check' }
    ] },
    { group: 'Sync and app', items: [
      { k: 'nudge', label: 'Lyrics timing offset', t: 'range', min: -2000, max: 2000, step: 50, fmt: (v) => (v > 0 ? '+' : '') + v + ' ms' },
      { k: 'displays', label: 'Show on', t: 'select', o: opt([['primary', 'Main display'], ['all', 'All displays']]) },
      { k: 'startAtLogin', label: 'Start with Windows', t: 'check' }
    ] }
  ];

  const PRESETS = {
    Midnight: { font: 'sf', caseMode: 'lower', textMode: 'solid', textColor: '#ffffff', bgGradient: true, bg1: '#000000', bg2: '#1b1140', bgAngle: 160, glow: 25, enter: 'pop', exit: 'blur', curve: 'easeOut', tilt: 0, minSize: 5, maxSize: 24 },
    Neon: { font: 'sf', caseMode: 'upper', textMode: 'rainbow', bgGradient: true, bg1: '#05000f', bg2: '#25004d', bgAngle: 200, glow: 85, enter: 'zoom', exit: 'explode', curve: 'spring', tilt: 4, minSize: 6, maxSize: 26 },
    Sunset: { font: 'sf', caseMode: 'lower', textMode: 'solid', textColor: '#fff1e0', bgGradient: true, bg1: '#2b0a1f', bg2: '#ff6a3d', bgAngle: 200, glow: 35, enter: 'slide', exit: 'fly', curve: 'easeInOut', tilt: 0, minSize: 5, maxSize: 22 },
    Paper: { font: 'serif', weight: 700, caseMode: 'asis', textMode: 'solid', textColor: '#1a1a1a', bgGradient: false, bg1: '#f4efe6', glow: 0, enter: 'fade', exit: 'fade', curve: 'easeOut', tilt: 0, minSize: 4, maxSize: 20 },
    Terminal: { font: 'mono', weight: 500, caseMode: 'asis', textMode: 'solid', textColor: '#8dff9b', bgGradient: false, bg1: '#070b07', glow: 60, enter: 'slide', exit: 'fade', curve: 'linear', tilt: 0, minSize: 4, maxSize: 16 },
    Loud: { font: 'sf', caseMode: 'upper', textMode: 'solid', textColor: '#ffffff', bgGradient: false, bg1: '#d4153c', glow: 0, enter: 'pop', exit: 'shrink', curve: 'easeIn', tilt: 6, minSize: 8, maxSize: 34, tracking: -4 }
  };

  let S = await window.wl.getSettings();
  const preview = WLRenderer.create(document.getElementById('preview'), { idleText: '' });
  const demo = WLRenderer.buildDemo();
  preview.setSettings(S);
  preview.setTrack(demo);
  let started = performance.now();
  const loopLen = demo.dur + 1500;
  setInterval(() => preview.setTime((performance.now() - started) % loopLen, true), 100);
  document.getElementById('restart').onclick = () => { started = performance.now(); };

  const refs = {};
  function build() {
    const form = document.getElementById('form');
    form.textContent = '';
    SCHEMA.forEach((g) => {
      const h = document.createElement('h2'); h.textContent = g.group; form.appendChild(h);
      if (g.group === 'Text') {
        const n = document.createElement('div'); n.className = 'note';
        n.textContent = 'The font file you provided is SF Pro Text Heavy, so weight is fixed while it is selected.';
        form.appendChild(n);
      }
      g.items.forEach((it) => {
        const row = document.createElement('div'); row.className = 'row';
        const lab = document.createElement('label'); lab.textContent = it.label; lab.htmlFor = 'f_' + it.k;
        let ctl;
        if (it.t === 'select') {
          ctl = document.createElement('select');
          it.o.forEach((o) => { const op = document.createElement('option'); op.value = o.v; op.textContent = o.l; ctl.appendChild(op); });
        } else {
          ctl = document.createElement('input');
          ctl.type = it.t === 'check' ? 'checkbox' : it.t;
          if (it.t === 'range') { ctl.min = it.min; ctl.max = it.max; ctl.step = it.step; }
        }
        ctl.id = 'f_' + it.k;
        const val = document.createElement('span'); val.className = 'val';
        ctl.addEventListener('input', () => {
          let v;
          if (it.t === 'check') v = ctl.checked;
          else if (it.t === 'range') v = Number(ctl.value);
          else v = ctl.value;
          S[it.k] = v;
          preview.setSettings({ [it.k]: v });
          window.wl.setSettings({ [it.k]: v });
          refresh();
        });
        row.append(lab, ctl, val);
        form.appendChild(row);
        refs[it.k] = { it, row, ctl, val };
      });
    });
  }

  function refresh() {
    Object.values(refs).forEach(({ it, row, ctl, val }) => {
      if (it.t === 'check') ctl.checked = !!S[it.k]; else ctl.value = S[it.k];
      val.textContent = it.fmt ? it.fmt(S[it.k]) : '';
      row.classList.toggle('off', !!(it.offIf && it.offIf(S)));
    });
  }

  const pre = document.getElementById('presets');
  Object.keys(PRESETS).forEach((name) => {
    const b = document.createElement('button'); b.textContent = name;
    b.onclick = () => { Object.assign(S, PRESETS[name]); preview.setSettings(PRESETS[name]); window.wl.setSettings(PRESETS[name]); refresh(); };
    pre.appendChild(b);
  });
  document.getElementById('reset').onclick = () => { if (confirm('Reset all settings to defaults?')) window.wl.resetSettings(); };

  window.wl.onSettings((s) => { S = Object.assign({}, s); preview.setSettings(S); refresh(); });

  build();
  refresh();
})();
