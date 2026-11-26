/* Shared lyric renderer: used by the fullscreen overlay and the live preview in Settings. */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const h32 = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  const FONTS = {
    sf: '"WLSans","Segoe UI",system-ui,sans-serif',
    system: '"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif',
    serif: 'Georgia,"Times New Roman",serif',
    mono: '"Cascadia Mono",Consolas,monospace',
    impact: 'Impact,"Arial Black",sans-serif'
  };

  const CURVES = {
    linear: (t) => t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeIn: (t) => t * t * t,
    easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    spring: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };

  const ENTER = {
    pop:   [{ opacity: 0, transform: 'scale(.6) translateY(.12em)', filter: 'blur(14px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
    fade:  [{ opacity: 0 }, { opacity: 1 }],
    slide: [{ opacity: 0, transform: 'translateY(.4em)' }, { opacity: 1, transform: 'none' }],
    blur:  [{ opacity: 0, filter: 'blur(28px)' }, { opacity: 1, filter: 'blur(0px)' }],
    zoom:  [{ opacity: 0, transform: 'scale(1.7)' }, { opacity: 1, transform: 'none' }],
    flip:  [{ opacity: 0, transform: 'perspective(700px) rotateX(75deg)' }, { opacity: 1, transform: 'none' }]
  };
  const EXIT = {
    fade:    [{ opacity: 1 }, { opacity: 0 }],
    blur:    [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(22px)' }],
    fly:     [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.45em)' }],
    shrink:  [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.55)' }],
    explode: [{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(1.6)', filter: 'blur(16px)' }]
  };

  const DEFAULT_SETTINGS = {
    font: 'sf', weight: 700, italic: false, caseMode: 'lower', tracking: -2,
    minSize: 5, maxSize: 24, sizeByDuration: true, refDur: 1.4, growMode: 'word', curve: 'easeOut',
    textMode: 'solid', textColor: '#ffffff', bgGradient: true, bg1: '#000000', bg2: '#1b1140', bgAngle: 160, glow: 25,
    enter: 'pop', enterMs: 380, exit: 'blur', exitMs: 320, tilt: 0, holdMs: 1500,
    vOffset: -4, align: 'center', showLine: false, lineSize: 2.4, lineOpacity: 35,
    showFooter: true, showHint: true, showProgress: true, nudge: 0
  };

  const displayText = (t) => t.replace(/^[“"‘'(\[]+|[,.;:!?…”"’)\]]+$/g, '') || t;

  /* Original demo lyrics with deliberately uneven word lengths, to show off the growing effect. */
  function buildDemo() {
    const src = [
      [['we', 240], ['let', 260], ['the', 200], ['lanterns', 640], ['drift', 900], ['away', 1700]],
      [['every', 420], ['flame', 760], ['a', 160], ['promise', 640], ['we', 220], ['never', 520], ['said', 1500]],
      [['so', 300], ['hold', 640], ['on', 320], ['a', 180], ['little', 460], ['longer', 2000]]
    ];
    let c = 800; const lines = [];
    src.forEach((ln) => {
      const s = c; const w = [];
      ln.forEach(([text, d]) => { w.push([text, c, c + d]); c += d + 20; });
      lines.push({ s, w }); c += 600;
    });
    return { key: 'demo|wordlight', title: 'Preview', artist: 'Wordlight', state: 'ready', lines, dur: c + 400 };
  }

  function create(stage, opts) {
    opts = opts || {};
    const doc = root.document;
    stage.classList.add('wl-stage');
    const mk = (cls) => { const e = doc.createElement('div'); e.className = cls; stage.appendChild(e); return e; };
    const bg = mk('wl-bg'), box = mk('wl-wordbox'), lineEl = mk('wl-line'), msg = mk('wl-msg'),
          foot = mk('wl-foot'), hint = mk('wl-hint'), prog = mk('wl-progress');
    const bar = doc.createElement('i'); prog.appendChild(bar);
    hint.textContent = opts.hint || '';

    let S = Object.assign({}, DEFAULT_SETTINGS);
    let track = null, flat = [], ranges = [], recs = [], hue = 0, durMs = 0;
    let base = 0, stamp = root.performance.now(), playing = false;
    let cur = -3, lineIdx = -2, lineEls = [], lineWi = -9, alive = true;

    const nowMs = () => (playing ? base + (root.performance.now() - stamp) : base);

    /* ---------- settings ---------- */
    function applySettings() {
      const st = stage.style;
      st.setProperty('--font', FONTS[S.font] || FONTS.sf);
      st.setProperty('--weight', S.font === 'sf' ? 800 : S.weight);
      st.setProperty('--tracking', (S.tracking / 100) + 'em');
      st.setProperty('--glow', S.glow / 100);
      st.setProperty('--text', S.textColor);
      st.setProperty('--line-op', S.lineOpacity / 100);
      stage.dataset.italic = S.italic ? '1' : '0';
      stage.dataset.case = S.caseMode;
      bg.style.background = S.bgGradient ? `linear-gradient(${S.bgAngle}deg, ${S.bg1}, ${S.bg2})` : S.bg1;
      box.dataset.align = S.align;
      box.style.transform = `translateY(${S.vOffset}cqh)`;
      lineEl.style.display = S.showLine ? '' : 'none';
      lineEl.style.fontSize = S.lineSize + 'cqw';
      foot.style.display = S.showFooter ? '' : 'none';
      hint.style.display = (S.showHint && opts.hint) ? '' : 'none';
      prog.style.display = S.showProgress ? '' : 'none';
      recs.forEach((r) => { r.wg.style.color = colorFor(r.idx); });
      relayoutAll();
      if (S.font === 'sf' && doc.fonts && doc.fonts.load) doc.fonts.load('800 100px WLSans').then(relayoutAll).catch(() => {});
    }

    function setSettings(next) { S = Object.assign({}, S, next || {}); applySettings(); }

    /* ---------- track ---------- */
    function clearLine() { lineEl.textContent = ''; lineEls = []; lineIdx = -2; lineWi = -9; }

    function setTrack(t) {
      track = t || null; flat = []; ranges = []; hue = 0; durMs = 0;
      removeAll(); clearLine(); cur = -3;
      if (!t || !t.key) { msg.textContent = opts.idleText || 'Play a song in Spotify'; foot.textContent = ''; return; }
      foot.textContent = `${t.title} · ${t.artist}`;
      hue = h32(t.artist + t.title) % 360;
      durMs = t.dur || 0;
      if (t.state === 'ready') {
        msg.textContent = '';
        t.lines.forEach((l, li) => {
          const start = flat.length;
          l.w.forEach((w) => flat.push({ text: w[0], t0: w[1], t1: w[2], li }));
          ranges.push([start, flat.length - 1]);
        });
      } else {
        msg.textContent = { loading: 'Finding lyrics…', none: 'No synced lyrics for this song', instrumental: '♪' }[t.state] || '';
      }
    }

    function setTime(pos, pl) {
      const c = nowMs();
      if (!pl || Math.abs(pos - c) > 400) base = pos; else base = c + (pos - c) * 0.25;
      playing = !!pl; stamp = root.performance.now();
    }
    function setDuration(ms) { if (ms > 0) durMs = ms; }

    /* ---------- words ---------- */
    function colorFor(idx) {
      if (S.textMode === 'rainbow') return `hsl(${(idx * 47) % 360} 85% 68%)`;
      if (S.textMode === 'song') { const w = flat[idx]; return `hsl(${(hue + ((w ? w.li : 0) * 23) % 90) % 360} 80% 72%)`; }
      return S.textColor;
    }

    function wordDuration(i) {
      const w = flat[i], n = flat[i + 1];
      let d = w.t1 - w.t0;
      if (S.growMode === 'next' && n && n.t0 > w.t0 && n.t0 - w.t0 < 3000) d = n.t0 - w.t0;
      return Math.max(120, d);
    }

    function finalVw(dur) {
      const mn = S.minSize, mx = Math.max(S.minSize, S.maxSize);
      const k = S.sizeByDuration ? clamp(dur / (Math.max(0.1, S.refDur) * 1000), 0.15, 1) : 1;
      return mn + (mx - mn) * k;
    }

    function measure(r) {
      r.wg.style.fontSize = '100px';
      r.wg.style.transform = 'none';
      r.wpx = Math.max(0.1, (r.txt.offsetWidth || 100) / 100);
    }

    function sizing(r) {
      const W = stage.clientWidth || 1;
      const fit = (0.9 * W) / r.wpx;
      const finalPx = Math.max(1, Math.min((r.finalVw / 100) * W, fit));
      const minPx = Math.min((S.minSize / 100) * W, finalPx);
      r.finalPx = finalPx; r.minPx = minPx;
      r.wg.style.fontSize = finalPx.toFixed(1) + 'px';
      updateScale(r, nowMs() + S.nudge);
    }

    function updateScale(r, tm) {
      if (r.exiting) return;
      const p = clamp((tm - r.w.t0) / r.dur, 0, 1);
      const k = (CURVES[S.curve] || CURVES.easeOut)(p);
      const px = lerp(r.minPx, r.finalPx, k);
      r.wg.style.transform = `scale(${clamp(px / r.finalPx, 0.02, 1.15).toFixed(4)})`;
    }

    function relayoutAll() {
      if (!stage.clientWidth) return;
      recs.forEach((r) => { r.finalVw = finalVw(r.dur); measure(r); sizing(r); });
    }

    function addWord(idx) {
      const w = flat[idx];
      const seed = h32(w.text + idx);
      const el = doc.createElement('div'); el.className = 'wl-word';
      const wa = doc.createElement('div'); wa.className = 'wl-wa';
      const wg = doc.createElement('div'); wg.className = 'wl-wg';
      const txt = doc.createElement('span'); txt.className = 'wl-w'; txt.textContent = displayText(w.text);
      wg.appendChild(txt); wa.appendChild(wg); el.appendChild(wa); box.appendChild(el);
      if (S.tilt > 0) el.style.transform = `rotate(${(((seed % 2001) / 1000) - 1) * S.tilt}deg)`;
      const dur = wordDuration(idx);
      const r = { idx, w, el, wa, wg, txt, dur, finalVw: finalVw(dur), wpx: 1, finalPx: 1, minPx: 1, exiting: false };
      wg.style.color = colorFor(idx);
      recs.push(r);
      measure(r); sizing(r);
      const kf = ENTER[S.enter];
      if (kf && S.enterMs > 0 && wa.animate) {
        wa.animate(kf, { duration: S.enterMs, easing: S.enter === 'pop' ? 'cubic-bezier(.2,1.3,.35,1)' : 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      }
    }

    function exitWord(r) {
      if (r.exiting) return;
      r.exiting = true;
      const kf = EXIT[S.exit];
      if (!kf || S.exitMs <= 0 || !r.wa.animate) { r.el.remove(); return; }
      const a = r.wa.animate(kf, { duration: S.exitMs, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
      a.onfinish = () => r.el.remove();
    }

    function exitAll() { recs.forEach(exitWord); recs = []; }
    function removeAll() { recs.forEach((r) => r.el.remove()); recs = []; }

    /* ---------- line below ---------- */
    function showLineFor(li) {
      lineEl.textContent = ''; lineEls = [];
      if (li < 0 || !ranges[li]) return;
      for (let k = ranges[li][0]; k <= ranges[li][1]; k++) {
        const sp = doc.createElement('span'); sp.className = 'wl-lw'; sp.textContent = flat[k].text;
        lineEl.appendChild(sp); lineEls.push(sp);
      }
    }

    /* ---------- frame loop ---------- */
    function frame() {
      if (!alive) return;
      const raw = nowMs();
      const tm = raw + S.nudge;
      if (flat.length) {
        let wi = -1;
        for (let i = 0; i < flat.length; i++) { if (flat[i].t0 <= tm + 30) wi = i; else break; }
        if (wi >= 0 && tm > flat[wi].t1 + S.holdMs) {
          const nx = flat[wi + 1];
          if (!nx || nx.t0 - tm > 400) wi = -2;
        }
        if (wi !== cur) {
          exitAll();
          if (wi >= 0) addWord(wi);
          cur = wi;
        }
        recs.forEach((r) => updateScale(r, tm));

        if (wi >= 0) {
          const li = flat[wi].li;
          if (li !== lineIdx) { lineIdx = li; showLineFor(li); lineWi = -9; }
          if (wi !== lineWi) {
            lineWi = wi;
            const startIdx = ranges[li][0];
            lineEls.forEach((el, k) => el.classList.toggle('on', startIdx + k <= wi));
          }
        } else if (wi === -1 && lineIdx !== -2) { clearLine(); }
      }
      bar.style.width = durMs > 0 ? clamp((raw / durMs) * 100, 0, 100).toFixed(2) + '%' : '0%';
      root.requestAnimationFrame(frame);
    }

    if (root.ResizeObserver) new root.ResizeObserver(() => relayoutAll()).observe(stage);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(relayoutAll).catch(() => {});
    applySettings();
    root.requestAnimationFrame(frame);

    return { setSettings, setTrack, setTime, setDuration, destroy() { alive = false; removeAll(); } };
  }

  root.WLRenderer = { create, buildDemo, DEFAULT_SETTINGS };
})(typeof window !== 'undefined' ? window : globalThis);
