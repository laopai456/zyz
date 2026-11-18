// ============================================================
// 8-bit 合成音效：WebAudio 振荡器+噪声，零素材依赖
// 首次用户手势时初始化（浏览器自动播放策略）；Sfx.enabled 可静音
// ============================================================
const Sfx = {
  ctx: null,
  enabled: true,

  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 无音频环境 */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // 单音：freq 起始频率，slide=结束频率（0 表示不滑），dur 秒
  tone(freq, dur, type = 'square', vol = 0.07, slide = 0, delay = 0) {
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  // 噪声爆点（打击/爆炸感）
  noise(dur = 0.08, vol = 0.05, delay = 0) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf;
    g.gain.setValueAtTime(vol, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
    s.connect(g); g.connect(c.destination);
    s.start(c.currentTime + delay);
  },

  play(name) {
    if (!this.enabled) return;
    if (!this.ensure()) return;
    switch (name) {
      case 'atk':     this.tone(620, 0.06, 'square', 0.05, 380); break;
      case 'skill':   this.tone(740, 0.09, 'square', 0.06, 980); this.noise(0.06, 0.04); break;
      case 'heal':    this.tone(523, 0.1, 'sine', 0.06, 660); this.tone(784, 0.12, 'sine', 0.05, 0, 0.08); break;
      case 'die':     this.tone(440, 0.14, 'square', 0.06, 110); this.noise(0.1, 0.05); break;
      case 'hurt':    this.tone(200, 0.16, 'sawtooth', 0.07, 80); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', 0.06, 0, i * 0.09)); break;
      case 'door':    this.tone(330, 0.18, 'triangle', 0.06, 660); break;
      case 'chest':   [659, 830, 988].forEach((f, i) => this.tone(f, 0.1, 'square', 0.055, 0, i * 0.07)); break;
      case 'summon':  this.tone(110, 0.3, 'sawtooth', 0.07, 55); this.noise(0.18, 0.05); break;
      case 'event':   this.tone(587, 0.1, 'triangle', 0.055, 740); break;
      case 'click':   this.tone(880, 0.04, 'square', 0.04); break;
      case 'win':     [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'square', 0.06, 0, i * 0.11)); break;
      case 'lose':    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.07, 0, i * 0.16)); break;
    }
  },
};
