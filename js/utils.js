// ============================================================
// 小工具：数学、随机、补间动画、飘字
// ============================================================
const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  randInt: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],

  // 逻辑帧间隔等待（配合 async 回合序列）
  sleep(ms) { return new Promise(res => setTimeout(res, ms)); },
};

// 补间：每帧由主循环调用 FX.update(dt)
const FX = {
  list: [],
  add(dur, update, done) { this.list.push({ t: 0, dur, update, done }); },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      const p = U.clamp(tw.t / tw.dur, 0, 1);
      tw.update(p);
      if (p >= 1) { this.list.splice(i, 1); if (tw.done) tw.done(); }
    }
  },
};

// 飘字（各场景各自持有实例数组，scene.draw 时按自己的坐标系渲染）
class FloatText {
  constructor(x, y, text, color, opts = {}) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.t = 0; this.dur = opts.dur || 1.0;
    this.size = opts.size || 12; this.vy = opts.vy ?? -28;
    this.dead = false;
  }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; }
  draw(ctx) {
    const p = this.t / this.dur;
    const y = this.y + this.vy * p;
    ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    ctx.font = `bold ${this.size}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(this.text, this.x, y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, y);
    ctx.globalAlpha = 1;
  }
}

// 颜色明度调整（#rrggbb, pct -100~100）
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => U.clamp(Math.round(v + (pct > 0 ? (255 - v) * pct / 100 : v * pct / 100)), 0, 255);
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
// 圆角矩形路径（独立小工具，供 UI / 场景共用）
function rrPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============================================================
// 即时模式 UI：圆角渐变按钮 + 精致面板（draw 注册矩形，pointerup 命中）
// ============================================================
const UI = {
  btns: [],
  begin() { this.btns = []; },
  button(ctx, x, y, w, h, label, opts = {}) {
    const en = opts.enabled !== false;
    const id = opts.id || label;
    this.btns.push({ x, y, w, h, en, id });
    if (opts.invisible) return id;                         // 只注册命中区，不画外观（卡片等自绘外观用）
    const r = opts.radius ?? Math.min(h / 2, 7);
    const base = opts.color || '#3d4770';
    // 渐变主体 + 顶部高光
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (en) { g.addColorStop(0, shade(base, 22)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -16)); }
    else { g.addColorStop(0, '#2a2e40'); g.addColorStop(1, '#1e2230'); }
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = g; ctx.fill();
    ctx.save();                                            // 顶部内高光
    rrPath(ctx, x + 1, y + 1, w - 2, h / 2, r - 1);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,' + (en ? 0.13 : 0.05) + ')';
    ctx.fillRect(x + 1, y + 1, w - 2, h / 2);
    ctx.restore();
    // 描边（金色调，禁用置灰）
    rrPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = en ? (opts.border || '#8a94c8') : '#4a4f64';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 文字
    ctx.fillStyle = en ? '#fff' : '#7d8299';
    ctx.font = `bold ${opts.size || 13}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    return id;
  },
  // 精致面板：深色渐变底 + 双层描边 + 四角饰角
  panel(ctx, x, y, w, h, opts = {}) {
    const r = opts.radius ?? 10;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, opts.color0 || '#2c3354');
    g.addColorStop(1, opts.color1 || '#1b1f38');
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = g; ctx.fill();
    rrPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = opts.border || '#7a6a3a'; ctx.lineWidth = 1.6; ctx.stroke();
    rrPath(ctx, x + 3.5, y + 3.5, w - 7, h - 7, r - 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    // 四角饰角（金色短 L 线）
    ctx.strokeStyle = opts.corner || '#d9b45a'; ctx.lineWidth = 2;
    const L = 9, ins = 2.5;
    for (const [cx, cy, dx, dy] of [[x + ins, y + ins, 1, 1], [x + w - ins, y + ins, -1, 1], [x + ins, y + h - ins, 1, -1], [x + w - ins, y + h - ins, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L);
      ctx.stroke();
    }
  },
  hit(x, y) {  // 后注册的（弹窗按钮）优先命中
    for (let i = this.btns.length - 1; i >= 0; i--) {
      const b = this.btns[i];
      if (b.en && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  },
};
