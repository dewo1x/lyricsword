const r = WLRenderer.create(document.getElementById('stage'), { hint: 'Click or press Esc to close' });
document.addEventListener('click', () => window.wl.close());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.wl.close(); });
window.wl.onInit((d) => { r.setSettings(d.settings); r.setTrack(d.track); r.setTime(0, d.playing); });
window.wl.onSettings((s) => r.setSettings(s));
window.wl.onTrack((t) => r.setTrack(t));
window.wl.onPos((p) => { r.setTime(p.pos, p.playing); r.setDuration(p.dur); });
window.wl.onVis((v) => document.body.classList.toggle('in', v));
