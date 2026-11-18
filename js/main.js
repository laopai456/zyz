// ============================================================
// 入口：画布缩放、输入路由、场景切换（v5 肉鸽版）
// 场景：menu → class → room ↔ battle → settle / enlighten
// ============================================================
const Main = {
  canvas: null, ctx: null,
  keys: {},
  scene: 'menu',                 // menu | class | room | battle | enlighten | settle
  room: null, battle: null, battleCfg: null,
  settle: null,
  _last: 0, _lastFrameAt: 0,

  init() {
    Pixel.init();
    Assets.load();                            // assets/ 有 AI 素材则热替换，无则矢量兜底
    Save.load();
    Sfx.enabled = Save.data.sfx !== false;
    this.canvas = document.getElementById('game');
    this.canvas.width = CONFIG.LOGICAL_W;
    this.canvas.height = CONFIG.LOGICAL_H;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = true;                  // 矢量立绘需要平滑缩放

    window.addEventListener('keydown', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = true;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = false;
    });

    const pt = e => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * CONFIG.LOGICAL_W / r.width,
        y: (e.clientY - r.top) * CONFIG.LOGICAL_H / r.height,
      };
    };
    // 音频环境需等首次用户手势（浏览器自动播放策略）
    window.addEventListener('pointerdown', () => Sfx.ensure());
    window.addEventListener('keydown', () => Sfx.ensure());
    this.canvas.addEventListener('pointerdown', e => {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成指针可忽略 */ }
      const { x, y } = pt(e);
      if (this.scene === 'battle') this.battle.onDown(x, y);
    });
    this.canvas.addEventListener('pointermove', e => {
      const { x, y } = pt(e);
      if (this.scene === 'battle') this.battle.onMove(x, y);
    });
    this.canvas.addEventListener('pointerup', e => {
      const { x, y } = pt(e);
      if (this.scene === 'battle') this.battle.onUp(x, y);
      else if (this.scene === 'room') this.room.onClick(x, y);
      else if (this.scene === 'menu') MenuUI.clickMenu(x, y);
      else if (this.scene === 'class') MenuUI.clickClass(x, y);
      else if (this.scene === 'enlighten') MenuUI.clickEnlighten(x, y);
      else if (this.scene === 'settle') MenuUI.clickSettle(x, y);
    });

    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(t => this._loop(t));
    // 兜底：标签页隐藏时 rAF 会整帧暂停，用定时器补驱动（可见时自动闲置）
    setInterval(() => {
      if (performance.now() - this._lastFrameAt > 200) this._loop(performance.now());
    }, 50);
  },

  _resize() {
    const s = Math.min(window.innerWidth / CONFIG.LOGICAL_W, window.innerHeight / CONFIG.LOGICAL_H);
    this.canvas.style.width = `${CONFIG.LOGICAL_W * s}px`;
    this.canvas.style.height = `${CONFIG.LOGICAL_H * s}px`;
  },

  // ---- Run 流转 ----
  launchRun(cls) {
    Rogue.startRun(cls);
    this.startRoom('combat');                 // 每层第一房固定战斗房
  },

  startRoom(type) {
    const cfg = Rogue.enterRoom(type);
    this.room = new RoomScene(cfg);
    this.scene = 'room';
  },

  onDoorEnter(type) {
    if (type === 'elite') { Rogue.enterRoom('elite'); this.startElite(); }   // 先登记消耗（eliteUsed/remaining）
    else this.startRoom(type);
  },

  startElite() {
    const { cfg, hero } = Rogue.eliteSetup();
    cfg.rewardText = `+${CONFIG.ROGUE.ELITE_WIN.merit}功德 +${CONFIG.ROGUE.ELITE_WIN.shenli}灵力`;
    this.battleCfg = cfg;
    this.battle = new BattleScene(cfg, hero, {
      onEnd: result => Rogue.eliteEnd(result, this.battle.hero),
      onExit: result => this._eliteExit(result),
    });
    this.scene = 'battle';
  },

  _eliteExit(result) {
    if (result === 'retry') {                 // 再战：HP 已回满，灵力已耗不退
      const r = Rogue.run;
      const hero = { cls: r.cls, hp: Talents.maxHp(r), maxHp: Talents.maxHp(r), divine: r.shenli };
      this.battle = new BattleScene(this.battleCfg, hero, {
        onEnd: result2 => Rogue.eliteEnd(result2, this.battle.hero),
        onExit: result2 => this._eliteExit(result2),
      });
      this.scene = 'battle';
      return;
    }
    // 离开（胜/负均可）：精英房已消耗，直接开门
    this.room = new RoomScene({ type: 'combat', layer: Rogue.run.layer, doors: Rogue.rollDoors() });
    this.scene = 'room';
  },

  startNextLayer(layer) {
    Rogue._enterLayer(layer);
    this.startRoom('combat');
  },

  onRunDeath() {
    const res = Rogue.finishRun();
    this.settle = { ...res, death: true };
    this.scene = 'settle';
  },

  onRunWin() {
    const res = Rogue.finishRun();
    this.settle = { ...res, win: true };
    this.scene = 'settle';
  },

  // ---- 主循环 ----
  _loop(t) {
    this._lastFrameAt = performance.now();
    requestAnimationFrame(tt => this._loop(tt));   // 先排下一帧：单帧异常不会杀死循环
    const dt = U.clamp((t - this._last) / 1000, 0, 0.05);
    this._last = t;
    FX.update(dt);
    const ctx = this.ctx;
    try {
      if (this.scene === 'menu') MenuUI.drawMenu(ctx);
      else if (this.scene === 'class') MenuUI.drawClass(ctx);
      else if (this.scene === 'enlighten') MenuUI.drawEnlighten(ctx);
      else if (this.scene === 'settle') MenuUI.drawSettle(ctx);
      else if (this.scene === 'room') { this.room.update(dt); this.room.draw(ctx); }
      else { this.battle.update(dt); this.battle.draw(ctx); }
    } catch (e) { window.__lastErr = e; }
  },
};

window.addEventListener('DOMContentLoaded', () => Main.init());
