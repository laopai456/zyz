// ============================================================
// 消消战斗场景：英雄与怪物回合制对打
// 回合结算顺序（设计文档定稿）：
//   1) 灼烧结算 → 2) 玩家操作结算刀数 → 3) 怪物刀数归零即胜利（怪物不出手）
//   4) 怪物必定攻击英雄 → 5) 英雄 HP 归零即失败
// ============================================================
class BattleScene {
  constructor(cfg, hero, callbacks) {
    this.cfg = cfg;
    this.cb = callbacks;               // { onEnd(result) } result: 'win' | 'lose'（HP回满/奖励由外层 Run 结算）
    this.BC = CONFIG.BOARD;
    this.BW = this.BC.COLS * this.BC.CELL;
    this.BX = (CONFIG.LOGICAL_W - this.BW) / 2;
    this.BY = 156;

    this.hero = { ...hero, flash: 0 };
    this.monster = {
      slashes: cfg.slashes, max: cfg.slashes,
      flash: 0, ox: 0,
      sprite: Pixel.sprites[cfg.monsterSprite] ? cfg.monsterSprite : 'mob_green',
    };
    this.burn = { turns: 0 };
    this.ultUses = cfg.ultUses;
    this.board = new Board(this.BC, cfg.locks);
    this.view = [];
    this._buildView();

    this.state = 'idle';               // idle|anim|ultSlash|ultPriest|ultPriestHold|ultMageBar|over
    this.over = null;                  // 'win' | 'lose'
    this.cutIn = null;                 // 大招出招立绘 { t, cls }
    this.floats = [];
    this.drag = null;                  // 棋盘拖动 { start, x, y }
    this.slashDrag = null;             // 战士划痕 { p1, p2 }
    this.priest = null;                // { cell, t0, sx, sy, curR }
    this.mage = null;                  // { t0 }
    this._hitApplied = false;
  }

  // ---------- 视图 ----------
  _makeGem(color) { return { color, cellX: 0, cellY: 0, scale: 1, alpha: 1 }; }
  _buildView() {
    this.view = Array.from({ length: this.BC.ROWS }, () => Array(this.BC.COLS).fill(null));
    for (let r = 0; r < this.BC.ROWS; r++)
      for (let c = 0; c < this.BC.COLS; c++) {
        const v = this.board.grid[r][c];
        if (v !== null && v !== -1) {
          const g = this._makeGem(v);
          g.cellX = c; g.cellY = r;
          this.view[r][c] = g;
        }
      }
  }
  cellCenter(c, r) { return { x: this.BX + (c + 0.5) * this.BC.CELL, y: this.BY + (r + 0.5) * this.BC.CELL }; }
  pxToCell(x, y) {
    const c = Math.floor((x - this.BX) / this.BC.CELL), r = Math.floor((y - this.BY) / this.BC.CELL);
    return this.board.inRange(c, r) ? { c, r } : null;
  }
  inBoard(x, y) { return x >= this.BX && x <= this.BX + this.BW && y >= this.BY && y <= this.BY + this.BW; }
  float(text, color, x = CONFIG.LOGICAL_W / 2, y = 128, size = 13) {
    this.floats.push(new FloatText(x, y, text, color, { size }));
  }

  // ---------- 回合引擎 ----------
  async commitAction(action) {
    // 从 idle（拖动交换）或任一大招手势状态进入
    if (!['idle', 'ultSlash', 'ultPriestHold', 'ultMageBar'].includes(this.state)) return;
    this.state = 'anim';
    const isSwap = action.type === 'swap';

    let dealt = 0;
    if (isSwap) {
      dealt = await this.resolveSwap(action.a, action.b);
      if (dealt === 0) { this.state = 'idle'; return; }     // 无消除不构成回合
    } else {
      // 大招：先扣费用（Miss 照样消耗回合与灵力）
      if (this.ultUses <= 0 || this.hero.divine < this.cfg.ultCost) { this.state = 'idle'; return; }
      this.ultUses--;
      this.hero.divine -= this.cfg.ultCost;
      dealt = await this.performUlt(action);
    }

    // —— 回合成立 ——
    if (this.burn.turns > 0 && !this._burnJustCast) {       // 灼烧：玩家操作前自动 -1 刀（施加当回合不结算）
      this.burn.turns--;
      await this.hitMonster(1, '#ff6b81');
      this.float('灼烧 -1刀', '#ff6b81', 296, 96);
      if (this.monster.slashes <= 0) return this.endBattle('win');
    }
    this._burnJustCast = false;
    if (dealt > 0) {
      await this.hitMonster(dealt);
      if (this.monster.slashes <= 0) return this.endBattle('win');
    }
    await this.monsterAttack();
    if (this.hero.hp <= 0) return this.endBattle('lose');
    await this.afterTurn();
    this.state = 'idle';
  }

  async resolveSwap(a, b) {
    await this.animateSwap(a, b);
    this.board.swap(a, b);
    if (!this.board.findRuns().length) {                    // 无效交换：退回，不耗回合
      this.board.swap(a, b);
      await this.animateSwap(a, b);
      this.float('无消除 · 不耗回合', '#9aa0b5');
      return 0;
    }
    return await this.clearAndCollapse(0);
  }

  // 消除→下落循环；step>=startStep 的每次消除 +连锁加成
  async clearAndCollapse(startStep) {
    let total = 0, step = startStep;
    while (true) {
      const runs = this.board.findRuns();
      if (!runs.length) break;
      const cells = new Set();
      let stepSlashes = 0;
      for (const run of runs) {
        stepSlashes += Board.slashFor(run.len) + (step > 0 ? (this.cfg.cascadeBonus ?? CONFIG.BATTLE.CASCADE_BONUS) : 0);
        for (const cl of run.cells) cells.add(cl.r * this.board.COLS + cl.c);
      }
      total += stepSlashes;
      this.float(`${step > 0 ? '连锁！' : ''}+${stepSlashes}刀（累计${total}刀）`, '#ffd166', this.BX + this.BW / 2, this.BY - 10, 13);
      this.board.clearCells(cells);              // 逻辑层清除（动画只负责视图）
      await this.animateClear(cells);
      await this.animateFall(this.board.collapsePlan());
      step++;
    }
    return total;
  }

  async performUlt(action) {
    const P = CONFIG.BATTLE.PRIEST, M = CONFIG.BATTLE.MAGE;
    this.cutIn = { t: 0, cls: this.hero.cls };              // 出招立绘切版
    if (action.type === 'slash') {                          // 战士：固定3刀 + 划过的方块计入连锁
      const set = new Set(action.cells.map(({ c, r }) => r * this.board.COLS + c));
      this.board.clearCells(set);
      await this.animateClear(set);
      await this.animateFall(this.board.collapsePlan());
      const fixed = CONFIG.BATTLE.SLASH_FIXED;
      const extra = await this.clearAndCollapse(1);
      this.float(`剑痕斩击 ${fixed}刀${extra > 0 ? ` +连锁${extra}刀` : ''}`, '#ff9f6b', 296, 92);
      return fixed + extra;
    }
    if (action.type === 'priest') {                         // 牧师：同心祈祷
      const d = P.DMG[action.grade];
      const names = { perfect: 'Perfect！', good: 'Good', bad: 'Bad', miss: '祝福偏移，失败' };
      const cols = { perfect: '#ffe66d', good: '#a8e6cf', bad: '#dfe6e9', miss: '#ff6b81' };
      let extra = '';
      if (action.grade === 'perfect') {
        const n = this.board.unlockRadius(action.cell.c, action.cell.r, P.UNLOCK_RADIUS);
        if (n > 0) { extra = ` 解锁${n}锁块`; this._syncViewAfterUnlock(); }
      }
      this.float(`${names[action.grade]} -${d}刀${extra}`, cols[action.grade], 296, 92, 13);
      await U.sleep(320);
      return d;
    }
    if (action.type === 'mage') {                           // 法师：咏唱灼烧
      const d = M.DMG[action.grade];
      const names = { perfect: 'Perfect！灼烧生效', good: 'Good', bad: 'Bad' };
      const cols = { perfect: '#ffe66d', good: '#a8e6cf', bad: '#dfe6e9' };
      if (action.grade === 'perfect') { this.burn.turns = this.cfg.burnTurns ?? CONFIG.BATTLE.BURN_TURNS; this._burnJustCast = true; }
      this.float(`${names[action.grade]} -${d}刀`, cols[action.grade], 296, 92, 13);
      await U.sleep(320);
      return d;
    }
    return 0;
  }

  // ---------- 大招出招立绘切版 ----------
  _drawCutIn(ctx) {
    const c = this.cutIn;
    if (!c) return;
    const accent = { swordsman: '#3fa7c4', taoist: '#e8b23a', monk: '#e8952f' }[c.cls];
    const names = { swordsman: '剑痕斩击', taoist: '咏唱灼烧', monk: '同心祈祷' };
    const subs = { swordsman: '一剑破万法', taoist: '符火燎原', monk: '佛光共渡' };
    const inT = Math.min(1, c.t / 0.22);
    const ease = 1 - Math.pow(1 - inT, 3);
    const outT = Math.max(0, (c.t - 0.78) / 0.32);
    const x = -260 + ease * 264 + outT * outT * 300;
    const alpha = Math.max(0, 1 - outT);
    const py = 40, ph = 106, pw = 244;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 面板底 + 职业色上下描边
    ctx.fillStyle = 'rgba(13,15,26,0.93)';
    ctx.fillRect(x, py, pw, ph);
    ctx.fillStyle = accent;
    ctx.fillRect(x, py, pw, 3);
    ctx.fillRect(x, py + ph - 3, pw, 3);
    // 速度拖尾线
    ctx.globalAlpha = alpha * 0.3;
    for (let i = 0; i < 6; i++) ctx.fillRect(x - 40 - i * 14, py + 10 + i * 15, 34 + i * 6, 2);
    ctx.globalAlpha = alpha;
    // 立绘
    const spr = Pixel.portraits[c.cls];
    if (spr) ctx.drawImage(spr, x + 5, py + 5, 96, 96);
    // 职业特效
    if (c.cls === 'swordsman') {
      const k = Math.min(1, c.t / 0.15);
      ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 105, py + 90 - k * 78); ctx.lineTo(x + 105 + 130 * k, py + 12); ctx.stroke();
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 100, py + 96 - k * 84); ctx.lineTo(x + 100 + 136 * k, py + 18); ctx.stroke();
    } else if (c.cls === 'taoist') {
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 205, py + 48, 18 + 5 * Math.sin(c.t * 18), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff7043';
      for (let i = 0; i < 3; i++) {
        const a = c.t * 10 + i * 2.1;
        ctx.fillRect(x + 205 + Math.cos(a) * 27 - 2, py + 48 + Math.sin(a) * 20 - 2, 4, 4);
      }
    } else {
      const g = Math.min(1, c.t / 0.4);
      ctx.globalAlpha = alpha * 0.25; ctx.fillStyle = '#ffe66d';
      ctx.beginPath(); ctx.arc(x + 205, py + 52, 8 + 18 * g, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 205, py + 52, 12 + 14 * g, 0, Math.PI * 2); ctx.stroke();
    }
    // 招式名 + 副标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.fillText(names[c.cls], x + 150, py + 56);
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(subs[c.cls], x + 150, py + 78);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  _syncViewAfterUnlock() {                                 // 解锁的锁块变成新方块，重建视图
    for (let r = 0; r < this.BC.ROWS; r++)
      for (let c = 0; c < this.BC.COLS; c++) {
        if (!this.view[r][c] && this.board.grid[r][c] >= 0) {
          const g = this._makeGem(this.board.grid[r][c]);
          g.cellX = c; g.cellY = r;
          this.view[r][c] = g;
        }
      }
  }

  async hitMonster(n, color = '#ffd166') {
    this.monster.slashes = Math.max(0, this.monster.slashes - n);
    this.float(`-${n}刀`, color, 296, 118, 15);
    this.monster.flash = 1;
    FX.add(0.25, p => { this.monster.flash = 1 - p; });
    await U.sleep(220);
  }

  async monsterAttack() {
    const dmg = this.cfg.dmgPerTurn;
    await new Promise(res => {
      FX.add(0.3, p => {
        this.monster.ox = -Math.sin(p * Math.PI) * 46;
        if (p >= 0.5 && !this._hitApplied) {
          this._hitApplied = true;
          this.hero.hp = Math.max(0, this.hero.hp - dmg);
          this.hero.flash = 1;
          FX.add(0.3, q => { this.hero.flash = 1 - q; });
          this.float(`怪物回合 · -${dmg}HP`, '#ff6b81', 64, 96, 12);
        }
      }, () => { this._hitApplied = false; res(); });
    });
    await U.sleep(80);
  }

  async afterTurn() {
    if (!this.board.hasMove()) {
      this.board.shuffle();
      this._buildView();
      this.float('棋盘无解 · 自动重排（不耗回合）', '#9aa0b5');
      await U.sleep(200);
    }
  }

  endBattle(result) {
    this.state = 'over';
    this.over = result;
    this.cb.onEnd(result);                                  // HP 回满/奖励/惩罚由外层 Run 结算
  }

  // ---------- 动画 ----------
  animateSwap(a, b) {
    const ga = this.view[a.r][a.c], gb = this.view[b.r][b.c];
    const ax = a.c, ay = a.r, bx = b.c, by = b.r;
    return new Promise(res => FX.add(0.12, p => {
      ga.cellX = U.lerp(ax, bx, p); ga.cellY = U.lerp(ay, by, p);
      gb.cellX = U.lerp(bx, ax, p); gb.cellY = U.lerp(by, ay, p);
    }, () => {
      [ga.cellX, ga.cellY, gb.cellX, gb.cellY] = [bx, by, ax, ay];
      this.view[a.r][a.c] = gb; this.view[b.r][b.c] = ga;
      res();
    }));
  }

  animateClear(cells) {
    const gems = [];
    for (const key of cells) {
      const c = key % this.board.COLS, r = Math.floor(key / this.board.COLS);
      if (this.view[r][c]) gems.push(this.view[r][c]);
    }
    return new Promise(res => FX.add(0.16, p => {
      for (const g of gems) { g.scale = 1 - p; g.alpha = 1 - p; }
    }, () => {
      for (const key of cells) {
        const c = key % this.board.COLS, r = Math.floor(key / this.board.COLS);
        this.view[r][c] = null;
      }
      res();
    }));
  }

  animateFall(plan) {
    const nv = Array.from({ length: this.BC.ROWS }, () => Array(this.BC.COLS).fill(null));
    for (const m of plan.moves) {
      const g = this.view[m.fromR][m.c];
      if (g) { g.cellX = m.c; nv[m.toR][m.c] = g; }
    }
    for (const s of plan.spawns) {
      const g = this._makeGem(s.color);
      g.cellX = s.c; g.cellY = s.startR;
      nv[s.toR][s.c] = g;
    }
    this.view = nv;
    const jobs = [];
    for (let r = 0; r < this.BC.ROWS; r++)
      for (let c = 0; c < this.BC.COLS; c++) {
        const g = nv[r][c];
        if (g) jobs.push({ g, tc: c, tr: r, fc: g.cellX, fr: g.cellY });
      }
    return new Promise(res => FX.add(0.15, p => {
      for (const j of jobs) {
        j.g.cellX = U.lerp(j.fc, j.tc, p);
        j.g.cellY = U.lerp(j.fr, j.tr, p);
      }
    }, () => {
      for (const j of jobs) { j.g.cellX = j.tc; j.g.cellY = j.tr; }
      res();
    }));
  }

  // ---------- 输入 ----------
  onDown(x, y) {
    if (this.state === 'over') return;
    if (this.state === 'idle') {                            // 记录拖动起点；按钮在 onUp 统一处理
      const cell = this.pxToCell(x, y);
      if (cell && this.board.isGem(cell.c, cell.r)) this.drag = { start: cell, x, y };
      return;
    }
    if (this.state === 'ultSlash') {
      if (this.inBoard(x, y)) this.slashDrag = { p1: { x, y }, p2: { x, y } };
      return;
    }
    if (this.state === 'ultPriest') {
      const cell = this.pxToCell(x, y);
      if (cell && this.board.isGem(cell.c, cell.r)) {
        this.state = 'ultPriestHold';
        this.priest = { cell, t0: performance.now(), sx: x, sy: y, curR: CONFIG.BATTLE.PRIEST.RADIUS_START };
      } else {
        this.float('点击棋盘上的方块作为中心', '#9aa0b5');
      }
      return;
    }
    if (this.state === 'ultMageBar') {
      const M = CONFIG.BATTLE.MAGE;
      const p = this._mageCursor();
      const d = Math.abs(p - 0.5);
      const grade = d <= M.PERFECT_HALF ? 'perfect' : d <= M.GOOD_HALF ? 'good' : 'bad';
      this.mage = null;
      this.commitAction({ type: 'mage', grade });
      return;
    }
  }

  onMove(x, y) {
    if (this.state === 'idle' && this.drag) { this.drag.x = x; this.drag.y = y; return; }
    if (this.state === 'ultSlash' && this.slashDrag) { this.slashDrag.p2 = { x, y }; return; }
    if (this.state === 'ultPriestHold' && this.priest) {
      if (U.dist(x, y, this.priest.sx, this.priest.sy) > CONFIG.BATTLE.PRIEST.MOVE_MISS) {
        this.priest = null;
        this.commitAction({ type: 'priest', grade: 'miss' });
      }
    }
  }

  onUp(x, y) {
    const bid = UI.hit(x, y);
    if (this.state === 'over') {
      if (bid === 'retry') this.cb.onExit('retry');
      else if (bid === 'exit') this.cb.onExit('exit');
      return;
    }
    if (bid) {
      if (bid === 'ult') {
        if (this.state !== 'idle') return;
        if (this.ultUses <= 0) { this.float('本场大招已耗尽', '#ff6b81'); return; }
        if (this.hero.divine < this.cfg.ultCost) { this.float('灵力不足', '#ff6b81'); return; }
        this.state = this.hero.cls === 'swordsman' ? 'ultSlash' : this.hero.cls === 'monk' ? 'ultPriest' : 'ultMageBar';
        if (this.state === 'ultMageBar') this.mage = { t0: performance.now() };
        if (this.state === 'ultSlash') this.float('在棋盘上划出一条剑痕', '#9aa0b5');
        return;
      }
      if (bid === 'cancel') {
        this.state = 'idle'; this.slashDrag = null; this.priest = null; this.mage = null;
        return;
      }
      return;
    }
    if (this.state === 'idle' && this.drag) {
      const cell = this.pxToCell(x, y);
      const start = this.drag.start;
      this.drag = null;
      if (cell && this.board.canSwap(start, cell)) this.commitAction({ type: 'swap', a: start, b: cell });
      return;
    }
    if (this.state === 'ultSlash' && this.slashDrag) {
      const cells = this._lineCells(this.slashDrag.p1, this.slashDrag.p2);
      this.slashDrag = null;
      if (cells.length) this.commitAction({ type: 'slash', cells });
      else this.float('划得太短，已取消', '#9aa0b5');
      return;
    }
    if (this.state === 'ultPriestHold' && this.priest) {
      const P = CONFIG.BATTLE.PRIEST;
      const cell = this.priest.cell;
      const err = Math.abs(this.priest.curR - P.RADIUS_TARGET);
      const pErr = P.ERR_PERFECT + (this.cfg.priestErrBonus || 0);   // 天赋稳手放宽
      const grade = err <= pErr ? 'perfect' : err <= P.ERR_GOOD ? 'good' : err <= P.ERR_BAD ? 'bad' : 'miss';
      this.priest = null;
      this.commitAction({ type: 'priest', grade, cell });
      return;
    }
  }

  _lineCells(p1, p2) {
    const set = new Set();
    const len = U.dist(p1.x, p1.y, p2.x, p2.y);
    const steps = Math.max(2, Math.ceil(len / 5));
    for (let i = 0; i <= steps; i++) {
      const x = U.lerp(p1.x, p2.x, i / steps), y = U.lerp(p1.y, p2.y, i / steps);
      const cell = this.pxToCell(x, y);
      if (cell && this.board.isGem(cell.c, cell.r)) set.add(cell.r * this.board.COLS + cell.c);
    }
    return [...set].map(k => ({ c: k % this.board.COLS, r: Math.floor(k / this.board.COLS) }));
  }

  _mageCursor() {
    const S = CONFIG.BATTLE.MAGE.SWEEP_SEC;
    const t = ((performance.now() - this.mage.t0) / 1000) % (2 * S);
    return t < S ? t / S : 1 - (t - S) / S;
  }

  // ---------- 帧循环 ----------
  update(dt) {
    if (this.cutIn) {
      this.cutIn.t += dt;
      if (this.cutIn.t > 1.15) this.cutIn = null;
    }
    for (const f of this.floats) f.update(dt);
    this.floats = this.floats.filter(f => !f.dead);
    if (this.state === 'ultPriestHold' && this.priest) {
      const P = CONFIG.BATTLE.PRIEST;
      const t = (performance.now() - this.priest.t0) / 1000;
      this.priest.curR = t <= P.SHRINK_SEC
        ? P.RADIUS_START * (1 - t / P.SHRINK_SEC)
        : -P.RADIUS_START * (t - P.SHRINK_SEC) / P.COLLAPSE_SEC;
      if (t > P.SHRINK_SEC + P.COLLAPSE_SEC + 0.25) {        // 握着不动到圈完全收拢 → Miss
        this.priest = null;
        this.commitAction({ type: 'priest', grade: 'miss' });
      }
    }
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    UI.begin();
    const W = CONFIG.LOGICAL_W;
    ctx.fillStyle = '#1b1e2e'; ctx.fillRect(0, 0, W, CONFIG.LOGICAL_H);

    // 顶栏
    ctx.fillStyle = '#12141f'; ctx.fillRect(0, 0, W, 44);
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = '#8f9bd4';
    ctx.fillText(this.cfg.name, 10, 18);
    const turnsLeft = Math.max(0, Math.floor(this.hero.hp / this.cfg.dmgPerTurn));
    ctx.textAlign = 'center';
    ctx.fillStyle = turnsLeft <= 3 ? '#ff6b81' : '#fff';
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.fillText(`还可挨 ${turnsLeft} 回合`, W / 2, 32);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c8a2ff'; ctx.fillText(`灵力 ${this.hero.divine}`, W - 10, 18);
    ctx.fillStyle = '#ffd166'; ctx.fillText(`大招 ${this.ultUses}/${this.cfg.ultUses}`, W - 10, 34);

    // 战斗区
    ctx.fillStyle = '#232741'; ctx.fillRect(0, 44, W, 100);
    // 英雄
    Pixel.drawSprite(ctx, Pixel.sprites[this.hero.cls], 64, 138, 1.7, this.hero.flash);
    this._bar(ctx, 20, 50, 100, this.hero.hp / this.hero.maxHp, '#2ecc71', `${this.hero.hp}/${this.hero.maxHp}`);
    // 怪物
    Pixel.drawSprite(ctx, Pixel.sprites[this.monster.sprite], 290 + this.monster.ox, 136, this.cfg.monsterScale, this.monster.flash);
    const mRatio = this.monster.slashes / this.monster.max;
    this._bar(ctx, 236, 50, 114, mRatio, '#ff6b81', `${this.monster.slashes}/${this.monster.max}刀`);
    if (this.burn.turns > 0) {
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#ff6b81';
      ctx.fillText(`灼烧x${this.burn.turns}`, 336, 88);
    }
    ctx.textAlign = 'left';

    // 棋盘
    ctx.fillStyle = '#171a29'; ctx.fillRect(this.BX - 6, this.BY - 6, this.BW + 12, this.BW + 12);
    for (let r = 0; r < this.BC.ROWS; r++)
      for (let c = 0; c < this.BC.COLS; c++) {
        const v = this.board.grid[r][c];
        const x = this.BX + c * this.BC.CELL, y = this.BY + r * this.BC.CELL;
        if (v === -1) this._drawLock(ctx, x, y);
        else {
          ctx.fillStyle = (r + c) % 2 ? '#1f2333' : '#1b1f2e';
          ctx.fillRect(x, y, this.BC.CELL, this.BC.CELL);
        }
        const g = this.view[r][c];
        if (g && g.alpha > 0.05) this._drawGem(ctx, g);
      }

    // 拖动高亮
    if (this.drag && this.state === 'idle') {
      const p = this.cellCenter(this.drag.start.c, this.drag.start.r);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x - this.BC.CELL / 2 + 2, p.y - this.BC.CELL / 2 + 2, this.BC.CELL - 4, this.BC.CELL - 4);
    }
    // 战士剑痕预览
    if (this.slashDrag) {
      ctx.strokeStyle = '#ff9f6b'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(this.slashDrag.p1.x, this.slashDrag.p1.y); ctx.lineTo(this.slashDrag.p2.x, this.slashDrag.p2.y); ctx.stroke();
    }
    // 牧师同心圈
    if (this.priest) {
      const P = CONFIG.BATTLE.PRIEST;
      const pos = this.cellCenter(this.priest.cell.c, this.priest.cell.r);
      const curR = Math.abs(this.priest.curR);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, P.RADIUS_TARGET, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = curR <= P.RADIUS_TARGET + P.ERR_PERFECT ? '#ffe66d' : 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, curR, 0, Math.PI * 2); ctx.stroke();
    }
    // 法师读条
    if (this.mage) {
      const M = CONFIG.BATTLE.MAGE, W2 = 260, X2 = (W - W2) / 2, Y2 = this.BY + this.BW / 2;
      ctx.fillStyle = '#10131f'; ctx.fillRect(X2 - 4, Y2 - 13, W2 + 8, 26);
      ctx.fillStyle = '#57606f'; ctx.fillRect(X2, Y2 - 9, W2, 18);
      ctx.fillStyle = '#a8e6cf';
      ctx.fillRect(X2 + W2 * (0.5 - M.GOOD_HALF), Y2 - 9, W2 * M.GOOD_HALF * 2, 18);
      ctx.fillStyle = '#ffe66d';
      ctx.fillRect(X2 + W2 * (0.5 - M.PERFECT_HALF), Y2 - 9, W2 * M.PERFECT_HALF * 2, 18);
      const p = this._mageCursor();
      ctx.fillStyle = '#fff';
      ctx.fillRect(X2 + W2 * p - 2, Y2 - 13, 4, 26);
    }

    this._drawCutIn(ctx);

    // 底部按钮与提示
    const hint = {
      idle: '拖动交换相邻方块发起回合（无消除不耗回合）',
      anim: '回合结算中…',
      ultSlash: '按住并划过方块，松手出剑',
      ultPriest: '点击棋盘上的方块确定中心',
      ultPriestHold: '外圈收缩到与中心重合时松手！',
      ultMageBar: '游标进入金色区域时点击屏幕！',
    }[this.state] || '';
    if (this.state === 'idle') {
      const en = this.ultUses > 0 && this.hero.divine >= this.cfg.ultCost;
      const sub = this.ultUses <= 0 ? '本场已耗尽' : !en ? '灵力不足' : '';
      const name = CONFIG.BATTLE.ULT_LABEL[this.hero.cls];
      UI.button(ctx, 70, 548, 220, 50, `${name}（${this.cfg.ultCost}灵力）${sub}`, { enabled: en, id: 'ult' });
    } else if (this.state !== 'anim' && this.state !== 'over') {
      UI.button(ctx, 120, 548, 120, 40, '取消', { id: 'cancel' });
    }
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#8f9bd4';
    ctx.fillText(hint, W / 2, 622);
    ctx.textAlign = 'left';

    // 飘字
    for (const f of this.floats) f.draw(ctx);

    // 结算弹窗
    if (this.over) this._drawOver(ctx);
  }

  _bar(ctx, x, y, w, ratio, color, label) {
    ratio = U.clamp(ratio, 0, 1);
    ctx.fillStyle = '#10131f'; ctx.fillRect(x - 1, y - 1, w + 2, 12);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * ratio, 10);
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(label, x + w / 2, y + 20);
    ctx.textAlign = 'left';
  }

  _drawGem(ctx, g) {
    const pos = { x: this.BX + (g.cellX + 0.5) * this.BC.CELL, y: this.BY + (g.cellY + 0.5) * this.BC.CELL };
    const s = this.BC.CELL * g.scale;
    if (s <= 1) return;
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = CONFIG.GEM_COLORS[g.color];
    const x = pos.x - s / 2, y = pos.y - s / 2;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + 4, y + 4, s - 8, (s - 8) * 0.35);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    ctx.globalAlpha = 1;
  }

  _drawLock(ctx, x, y) {
    ctx.fillStyle = '#4a4f64'; ctx.fillRect(x + 4, y + 4, this.BC.CELL - 8, this.BC.CELL - 8);
    ctx.strokeStyle = '#6f7590'; ctx.lineWidth = 2; ctx.strokeRect(x + 6, y + 6, this.BC.CELL - 12, this.BC.CELL - 12);
    ctx.fillStyle = '#c9cede';
    const cx = x + this.BC.CELL / 2;
    ctx.fillRect(cx - 6, y + 14, 12, 9);                    // 锁体
    ctx.beginPath(); ctx.arc(cx, y + 14, 4, Math.PI, 0); ctx.stroke(); // 锁环
  }

  _drawOver(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, CONFIG.LOGICAL_W, CONFIG.LOGICAL_H);
    const w = 300, h = 190, x = (CONFIG.LOGICAL_W - w) / 2, y = 210;
    ctx.fillStyle = '#232741'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = this.over === 'win' ? '#2ecc71' : '#ff6b81'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = this.over === 'win' ? '#2ecc71' : '#ff6b81';
    ctx.fillText(this.over === 'win' ? '胜 利' : '败 北', CONFIG.LOGICAL_W / 2, y + 44);
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#c9cede';
    if (this.over === 'win') {
      ctx.fillText(`缚妖阵破！${this.cfg.rewardText || ''}`, CONFIG.LOGICAL_W / 2, y + 78);
      ctx.fillText('HP 已回满', CONFIG.LOGICAL_W / 2, y + 102);
      UI.button(ctx, x + 70, y + h - 52, w - 140, 38, '继续前进', { id: 'exit' });
    } else {
      ctx.fillText('败北：HP 回满，已耗灵力不退还', CONFIG.LOGICAL_W / 2, y + 78);
      UI.button(ctx, x + 40, y + h - 52, 100, 38, '再战一场', { id: 'retry' });
      UI.button(ctx, x + w - 140, y + h - 52, 100, 38, '离开', { id: 'exit' });
    }
    ctx.textAlign = 'left';
  }
}
