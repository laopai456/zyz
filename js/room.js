// ============================================================
// 单屏战斗房：妖物波次、门选择、事件/宝箱/三选一弹窗、挂机开关
// 改造自 v4 world.js（AI/挂机逻辑复用，地图改为单屏房间）
// ============================================================
class RoomScene {
  constructor(cfg) {
    this.cfg = cfg;
    const R = CONFIG.ROOM;
    this.mapX = 0; this.mapY = 96;
    this.MH = R.ROWS * R.TILE;                        // 480

    this.state = 'fight';                             // fight|clear|event|chest|talent|layer|dead
    this.idle = false;
    this.px = R.COLS * R.TILE / 2;
    this.py = this.mapY + this.MH - 40;
    this.invuln = 0.5;
    this.atkTimer = 0; this.skillCd = 0;
    this.playerFlash = 0;
    this.floats = [];
    this.bullets = [];
    this.mobs = [];
    this.mobsLeft = 0;
    this.doors = [];                                  // {type, x, y}
    this.modal = null;                                // {kind, ...}
    this.banner = null;                               // 顶部横幅文字（限时）
    this.t0 = 0;
    this.shake = 0;                                   // 受击震屏强度（像素，随时间衰减）
    this.hurtFx = 0;                                  // 受伤红晕强度 0~1
    this.parts = [];                                  // 粒子/光环/剑痕特效

    // 装饰障碍（避开门口与出生区）
    this.decor = [];
    const safeZones = [
      { x: R.COLS * R.TILE / 2, y: this.mapY + this.MH - 44 },   // 玩家出生区
      { x: R.COLS * R.TILE / 2, y: this.mapY + 18 },             // 门区
    ];
    for (let i = 0; i < CONFIG.ROOM.DECOR; i++) {
      let x, y, tries = 0;
      do {
        const c = U.randInt(1, R.COLS - 2), r = U.randInt(2, R.ROWS - 3);
        x = c * R.TILE + R.TILE / 2;
        y = this.mapY + r * R.TILE + R.TILE / 2;
      } while (++tries < 20 && safeZones.some(s => U.dist(x, y, s.x, s.y) < 80));
      this.decor.push({ s: Math.random() < 0.5 ? 'tree' : 'rock', x, y });
    }

    const type = cfg.type;
    if (cfg.doors) {                                  // 精英房打完直接进入开门状态
      this.state = 'clear';
      this._openDoors(cfg.doors);
    } else if (type === 'event') {
      this.state = 'event';
      Sfx.play('event');
      this.modal = { kind: 'event', ev: Events.random(Rogue.run) };
    } else if (type === 'chest') {
      this.state = 'chest';
      Sfx.play('chest');
      const rew = Rogue.openChest();
      this.modal = { kind: 'chest', merit: rew.merit, heal: rew.heal };
    } else if (type === 'boss' && cfg.boss) {
      this.state = 'fight';
      this._spawnBoss();
      this.banner = { text: '妖王 · 出阵', t: 2 };
    } else {
      this.state = 'fight';
      this._spawnMobs(cfg.mobs || []);
      if (cfg.ambushMerit) this.ambushMerit = cfg.ambushMerit;
    }

    // 吐纳诀：每进入新房间回复 15% 气血
    if (Events.has(Rogue.run, 'tuna')) {
      const mh = Talents.maxHp(Rogue.run);
      if (Rogue.run.hp < mh) {
        const h = Math.min(mh - Rogue.run.hp, Math.round(mh * 0.15));
        Rogue.run.hp += h;
        this.float(`吐纳诀 +${h}`, '#2ecc71', this.px, this.py - 44, 12);
      }
    }
  }

  // ---------- 生成 ----------
  _mobStats(variant, layer, opts = {}) {
    const base = CONFIG.ROGUE.MOBS[variant];
    const mult = CONFIG.ROGUE.LAYER_CFG[layer - 1].mult;
    const s = {
      variant, hp: base.hp * mult, maxHp: base.hp * mult,
      atk: base.atk * mult, speed: base.speed,
      scale: base.scale, drop: base.drop,
      atkInt: base.atkInt, range: base.range,
      ranged: base.ranged || null, shootT: 1,
      x: 0, y: 0, flash: 0, atkTimer: U.randInt(5, 15) / 10,
      wanderT: 0, tx: 0, ty: 0, home: null,
      miniboss: false, boss: false, affix: null,
    };
    if (opts.elite) {
      const E = CONFIG.ROGUE.ELITE_AFFIX;
      s.hp *= E.statMult; s.maxHp = s.hp; s.atk *= E.statMult;
      s.scale *= E.scaleMult; s.drop *= E.dropMult;
      s.affix = Math.random() < 0.5 ? '狂暴' : '硬化';
      if (s.affix === '狂暴') s.atkInt *= 0.67;
    }
    if (opts.miniboss) {
      const M = CONFIG.ROGUE.MINIBOSS;
      s.hp *= M.statMult; s.maxHp = s.hp; s.atk *= M.statMult;
      s.scale *= M.scaleMult; s.drop = 0;             // 奖励由层结算给
      s.miniboss = true;
    }
    return s;
  }

  _spawnPoints() {
    const R = CONFIG.ROOM, sp = [];
    for (const [c, r] of [[1, 1], [7, 1], [4, 3], [1, 6], [7, 6]]) {
      sp.push({ x: c * R.TILE + R.TILE / 2, y: this.mapY + r * R.TILE + R.TILE / 2 });
    }
    return sp;
  }

  _spawnMobs(list) {
    const sp = this._spawnPoints();
    list.forEach((m, i) => {
      const s = this._mobStats(m.variant, this.cfg.layer, { elite: m.elite, miniboss: m.miniboss });
      const p = sp[i % sp.length];
      s.x = p.x + U.randInt(-12, 12); s.y = p.y + U.randInt(-12, 12);
      s.home = { x: s.x, y: s.y };
      this.mobs.push(s);
    });
    this.mobsLeft = this.mobs.length;
  }

  _spawnBoss() {
    const B = CONFIG.ROGUE.BOSS;
    this.mobs.push({
      variant: 'boss', boss: true, hp: B.hp, maxHp: B.hp, atk: B.atk,
      speed: B.speed, scale: B.scale, drop: 0, atkInt: 1.8, range: 30,
      ranged: null, shootT: 0, x: CONFIG.ROOM.COLS * CONFIG.ROOM.TILE / 2,
      y: this.mapY + 120, flash: 0, atkTimer: 1, wanderT: 0, tx: 0, ty: 0,
      home: { x: CONFIG.ROOM.COLS * CONFIG.ROOM.TILE / 2, y: this.mapY + 120 },
      summonStage: 0, miniboss: false, affix: null,
    });
    this.mobsLeft = 1;
  }

  _summonBossAdds(boss) {
    const alive = this.mobs.filter(m => m.variant !== 'boss').length;
    const n = Math.min(CONFIG.ROGUE.BOSS.summonCount, CONFIG.ROGUE.BOSS.summonCap - alive);
    for (let i = 0; i < n; i++) {
      const s = this._mobStats('green', 3);
      s.x = boss.x + U.randInt(-60, 60); s.y = boss.y + U.randInt(20, 60);
      s.home = { x: s.x, y: s.y };
      this.mobs.push(s);
    }
    if (n > 0) {
      Sfx.play('summon');
      this.shake = 4;
      this._ringFx(boss.x, boss.y - 14, '#8e44ad', 80, 0.4);
      this.float('妖王唤出小妖！', '#ff6b81', this.px, this.py - 44, 13);
    }
  }

  // ---------- 工具 ----------
  float(text, color, x = this.px, y = this.py - 26, size = 12) {
    this.floats.push(new FloatText(x, y, text, color, { size }));
  }
  inMap(x, y) { return x > 8 && x < CONFIG.ROOM.COLS * CONFIG.ROOM.TILE - 8 && y > this.mapY + 8 && y < this.mapY + this.MH - 8; }

  // ---------- 帧循环 ----------
  update(dt) {
    const P = CONFIG.PLAYER, r = Rogue.run;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.playerFlash > 0) this.playerFlash = Math.max(0, this.playerFlash - dt * 3);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);
    if (this.hurtFx > 0) this.hurtFx = Math.max(0, this.hurtFx - dt * 2.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.dur) { this.parts.splice(i, 1); continue; }
      if (!p.ring && !p.line) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
    }
    for (const f of this.floats) f.update(dt);
    this.floats = this.floats.filter(f => !f.dead);

    const paused = ['event', 'chest', 'talent', 'layer'].includes(this.state);
    if (paused) return;

    const keys = (typeof Main !== 'undefined' && Main.keys) || {};
    const ix = (keys['ArrowLeft'] || keys['a'] ? -1 : 0) + (keys['ArrowRight'] || keys['d'] ? 1 : 0);
    const iy = (keys['ArrowUp'] || keys['w'] ? -1 : 0) + (keys['ArrowDown'] || keys['s'] ? 1 : 0);
    if (ix || iy) this.idle = false;
    this.atkTimer -= dt; this.skillCd -= dt;

    const spd = P.SPEED * Talents.speedMult(r);
    if ((ix || iy) && this.inMap(this.px, this.py)) {
      const l = Math.hypot(ix, iy) || 1;
      this._tryMove((ix / l) * spd * dt, (iy / l) * spd * dt);
    }
    if (keys['j'] && this.atkTimer <= 0) this._attackNearest();
    if (this.idle) this._autoTick(dt);

    // 开门状态：走向门即切换
    if (this.state === 'clear') {
      for (const d of this.doors) {
        if (U.dist(this.px, this.py, d.x, d.y) < 28) { Sfx.play('door'); Main.onDoorEnter(d.type); return; }
      }
    }

    this._updateMobs(dt);
    this._updateBullets(dt);

    // 战斗结束判定
    if (this.state === 'fight' && this.mobsLeft <= 0) this._onRoomCleared();

    // 升级三选一
    if (this.state === 'fight' && r.pendingPicks > 0) {
      this.state = 'talent';
      this.modal = { kind: 'talent', picks: Talents.draw3(r) };
    }
  }

  _hitDecor(x, y) {
    for (const d of this.decor) if (U.dist(x, y, d.x, d.y) < 20) return true;
    return false;
  }

  // 轴分离滑动 + 斜向自救：直撞被挡时尝试单轴绕行，再不行转 ±45°
  _tryMove(dx, dy) {
    if (dx === 0 && dy === 0) return;
    const set = (nx, ny) => {
      this.px = U.clamp(nx, 14, CONFIG.ROOM.COLS * CONFIG.ROOM.TILE - 14);
      this.py = U.clamp(ny, this.mapY + 16, this.mapY + this.MH - 6);
    };
    const nx = this.px + dx, ny = this.py + dy;
    if (!this._hitDecor(nx, ny)) { set(nx, ny); return; }
    if (!this._hitDecor(nx, this.py)) { set(nx, this.py); return; }
    if (!this._hitDecor(this.px, ny)) { set(this.px, ny); return; }
    for (const s of [1, -1]) {                                   // 转 ±45° 绕出阴影锥
      const ax = dx * Math.cos(s * Math.PI / 4) - dy * Math.sin(s * Math.PI / 4);
      const ay = dx * Math.sin(s * Math.PI / 4) + dy * Math.cos(s * Math.PI / 4);
      const tx = this.px + ax, ty = this.py + ay;
      if (!this._hitDecor(tx, ty)) { set(tx, ty); return; }
    }
  }

  _nearestMob() {
    let best = null, bd = 1e9;
    for (const m of this.mobs) {
      const d = U.dist(m.x, m.y, this.px, this.py);
      if (d < bd) { bd = d; best = m; }
    }
    return { m: best, d: bd };
  }

  // ---------- 打击感特效 ----------
  _spark(x, y, color, n = 4, spd = 55) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.5 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, dur: 0.3, color, size: 3 });
    }
  }
  _ringFx(x, y, color, r1 = 70, dur = 0.28, color2) {
    this.parts.push({ ring: true, x, y, r0: 10, r1, t: 0, dur, color, color2 });
  }
  _lineFx(x1, y1, x2, y2, color, dur = 0.16) {
    this.parts.push({ line: true, x1, y1, x2, y2, t: 0, dur, color });
  }

  _dealDamage(m, dmg, label) {
    if (m.affix === '硬化') dmg = Math.round(dmg * 0.7);
    m.hp -= dmg; m.flash = 1;
    // 击退：沿受击方向弹开一小段
    const d = U.dist(this.px, this.py, m.x, m.y) || 1;
    const kb = m.boss || m.miniboss ? 3 : 6;
    m.x = U.clamp(m.x + (m.x - this.px) / d * kb, 12, CONFIG.ROOM.COLS * CONFIG.ROOM.TILE - 12);
    m.y = U.clamp(m.y + (m.y - this.py) / d * kb, this.mapY + 14, this.mapY + this.MH - 10);
    this._spark(m.x, m.y - 14, '#fff3c4', 3, 45);
    if (label) this.float(`${label} -${dmg}`, '#ff9f6b', m.x, m.y - 30, 12);
    else this.float(`-${dmg}`, '#fff', m.x + U.randInt(-6, 6), m.y - 24);
    if (m.hp <= 0) this._killMob(m);
  }

  _attackNearest() {
    const { m, d } = this._nearestMob();
    if (!m || d > CONFIG.PLAYER.RANGE) return;
    const r = Rogue.run;
    const dmg = Talents.atk(r);
    this.atkTimer = CONFIG.PLAYER.ATK_INT * Talents.atkIntMult(r);
    Sfx.play('atk');
    this._lineFx(this.px, this.py - 14, m.x, m.y - 12, '#e6edf2');
    this._dealDamage(m, dmg);
    // 溅射天赋
    const sp = Talents.splashMult(r);
    if (sp > 0) {
      for (const t of this.mobs) {
        if (t !== m && t.hp > 0 && U.dist(t.x, t.y, m.x, m.y) < 60) this._dealDamage(t, Math.round(dmg * sp));
      }
    }
  }

  _autoTick(dt) {
    const { m, d } = this._nearestMob();
    if (!m) return;
    const P = CONFIG.PLAYER, r = Rogue.run, C = CONFIG.CLASSES[r.cls];
    if (d > P.RANGE) {
      const k = P.SPEED * Talents.speedMult(r) * dt / (d || 1);
      this._tryMove((m.x - this.px) * k, (m.y - this.py) * k);
      return;
    }
    if (this.atkTimer <= 0) this._attackNearest();
    const S = C.skill;
    if (this.skillCd > 0) return;
    if (r.cls === 'swordsman' && d <= P.RANGE) {
      Sfx.play('skill');
      this._lineFx(this.px, this.py - 14, m.x, m.y - 12, '#3fa7c4', 0.22);
      this._dealDamage(m, Math.round(Talents.atk(r) * S.mult), S.name);
      this.skillCd = S.cd * Talents.cdMult(r);
    } else if (r.cls === 'taoist') {
      const dmg = Math.round(Talents.atk(r) * S.mult);
      let hit = false;
      for (const t of [...this.mobs]) {
        if (t.hp > 0 && U.dist(t.x, t.y, this.px, this.py) <= S.radius) {
          this._dealDamage(t, dmg, S.name); hit = true;
        }
      }
      if (hit) {
        Sfx.play('skill');
        this._ringFx(this.px, this.py - 10, '#ff7043', S.radius, 0.32);
        this.float(`${S.name}！`, '#c8a2ff', this.px, this.py - 34, 13);
        this.skillCd = S.cd * Talents.cdMult(r);
      }
    } else if (r.cls === 'monk') {
      const mh = Talents.maxHp(r);
      if (r.hp < mh * S.hpGate) {
        const heal = Math.round(mh * S.healPct);
        r.hp = Math.min(mh, r.hp + heal);
        Sfx.play('heal');
        this._ringFx(this.px, this.py - 10, '#2ecc71', 52, 0.4);
        this._spark(this.px, this.py - 16, '#a8e6cf', 6, 40);
        this.float(`${S.name} +${heal}`, '#2ecc71', this.px, this.py - 34, 13);
        this.skillCd = S.cd * Talents.cdMult(r);
      }
    }
  }

  _updateMobs(dt) {
    const r = Rogue.run;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.hp <= 0) { this.mobs.splice(i, 1); continue; }
      if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 3);
      const d = U.dist(m.x, m.y, this.px, this.py);
      const aggro = d < 130 || m.boss || m.miniboss;
      if (m.ranged && aggro) {                            // 远程妖：保持距离吐弹
        if (d > m.ranged.keepDist) this._moveToward(m, dt);
        else if (d < m.ranged.keepDist - 24) this._moveToward(m, dt, -1);
        m.shootT -= dt;
        if (m.shootT <= 0) {
          m.shootT = m.ranged.interval;
          const k = m.ranged.bulletSpeed / (d || 1);
          this.bullets.push({ x: m.x, y: m.y - 10, vx: (this.px - m.x) * k, vy: (this.py - m.y) * k, atk: m.atk });
        }
      } else if (aggro) {
        if (d > m.range) this._moveToward(m, dt);
        else {
          m.atkTimer -= dt;
          if (m.atkTimer <= 0) { m.atkTimer = m.atkInt; this._hurtPlayer(m.atk); }
        }
        if (m.boss) {                                     // 妖王召唤
          const stage = Math.floor((1 - m.hp / m.maxHp) / CONFIG.ROGUE.BOSS.summonHpPct + 0.0001);
          if (stage > (m.summonStage || 0)) { m.summonStage = stage; this._summonBossAdds(m); }
        }
      } else {                                            // 闲逛
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wanderT = U.randInt(15, 30) / 10;
          m.tx = m.home.x + U.randInt(-50, 50); m.ty = m.home.y + U.randInt(-50, 50);
        }
        const dw = U.dist(m.x, m.y, m.tx, m.ty);
        if (dw > 4) this._movePoint(m, m.tx, m.ty, m.speed * 0.4 * dt);
      }
    }
  }

  _moveToward(m, dt, sign = 1) {
    this._movePoint(m, this.px, this.py, m.speed * dt * sign);
  }
  _movePoint(m, tx, ty, step) {
    const d = U.dist(m.x, m.y, tx, ty) || 1;
    m.x += (tx - m.x) / d * step; m.y += (ty - m.y) / d * step;
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (!this.inMap(b.x, b.y)) { this.bullets.splice(i, 1); continue; }
      if (U.dist(b.x, b.y, this.px, this.py) < 14) {
        this.bullets.splice(i, 1);
        this._hurtPlayer(b.atk);
      }
    }
  }

  _hurtPlayer(atk) {
    if (this.invuln > 0) return;
    this.invuln = 0.35;
    this.playerFlash = 1;
    this.shake = 5;
    this.hurtFx = 0.8;
    Sfx.play('hurt');
    const died = Rogue.hurtPlayer(atk);
    this.float(`-${atk}`, '#ff6b81', this.px, this.py - 26);
    if (died && Rogue.run.items.includes('hufu')) {
      // 护身符：免死并回复 30% 气血
      Rogue.run.items.splice(Rogue.run.items.indexOf('hufu'), 1);
      Rogue.run.hp = Math.round(Talents.maxHp(Rogue.run) * 0.3);
      Sfx.play('chest');
      this._ringFx(this.px, this.py - 10, '#ffe66d', 60, 0.4);
      this.float('护身符碎裂！免死回气', '#ffe66d', this.px, this.py - 48, 13);
      return;
    }
    if (died) { Sfx.play('lose'); this.state = 'dead'; Main.onRunDeath(); }
  }

  _killMob(m) {
    const r = Rogue.run;
    this.mobs = this.mobs.filter(t => t !== m);
    if (m.boss) {
      this._spark(m.x, m.y - 16, '#c8a2ff', 14, 90);
      this.mobsLeft = 0;
      this._bossCleared();
      return;
    }
    const lv0 = r.lv;
    const drop = { merit: CONFIG.ROGUE.MERIT_PER_KILL * m.drop, shenli: CONFIG.ROGUE.SHENLI_PER_KILL * (m.drop > 1 ? m.drop : 1) };
    Rogue.gainKill(drop);
    // 死亡碎裂粒子（按妖物主色）
    const col = { green: '#2ecc71', red: '#e74c3c', purple: '#9b59b6', gold: '#f1c40f' }[m.variant] || '#fff';
    this._spark(m.x, m.y - 14, col, 8, 70);
    Sfx.play('die');
    this.float(`+${CONFIG.ROGUE.XP_PER_KILL}经验`, '#a8e6cf', m.x, m.y - 34, 11);
    this.float(`+${drop.merit}功德`, '#ffd166', m.x + 8, m.y - 20, 11);
    this.float(`+${drop.shenli}灵力`, '#c8a2ff', m.x - 8, m.y - 46, 11);
    if (r.lv > lv0) {
      Sfx.play('levelup');
      this._ringFx(this.px, this.py - 10, '#ffe66d', 64, 0.45);
      this.float(`Lv.${r.lv} 升级！气血回满`, '#ffe66d', this.px, this.py - 52, 14);
    }
    this.mobsLeft = this.mobs.filter(t => !t.boss).length;
  }

  _onRoomCleared() {
    const r = Rogue.run;
    if (this.cfg.type === 'boss') { this._bossCleared(); return; }   // 守关妖走层间流程
    if (this.cfg.ambushMerit) {
      r.merit += this.cfg.ambushMerit;
      this.float(`伏击平定 +${this.cfg.ambushMerit}功德`, '#ffd166', this.px, this.py - 44, 13);
    }
    // 清房奇遇：30% 弹出文字事件，抉择后再开门
    if (Math.random() < 0.3) {
      this.state = 'event';
      Sfx.play('event');
      this.modal = { kind: 'event', ev: Events.random(r), encounter: true };
      return;
    }
    this.state = 'clear';
    this.doors = [];
    this._openDoors(Rogue.rollDoors());
  }

  _bossCleared() {
    const res = Rogue.onBossCleared();
    if (res.win) { Rogue.run.won = true; Sfx.play('win'); Main.onRunWin(); return; }
    Sfx.play('chest');
    this.state = 'layer';
    this.modal = { kind: 'layer', nextLayer: res.nextLayer, msg: res.msg };
  }

  _openDoors(types) {
    const R = CONFIG.ROOM;
    const labels = { combat: '战斗', elite: '缚妖阵', event: '奇遇', chest: '宝箱', boss: '妖王' };
    const xs = types.length === 1 ? [R.COLS * R.TILE / 2] : [R.COLS * R.TILE * 0.28, R.COLS * R.TILE * 0.72];
    this.doors = types.map((t, i) => ({ type: t, label: labels[t], x: xs[i], y: this.mapY + 18 }));
    this.float('此房已清，择路而行的门开了', '#9aa0b5', 180, this.mapY + 70, 12);
  }

  // ---------- 弹窗交互 ----------
  onClick(x, y) {
    const bid = UI.hit(x, y);
    if (!bid) return;
    const r = Rogue.run;
    if (this.modal && this.modal.kind === 'talent' && bid.startsWith('talent')) {
      const idx = +bid.slice(6);
      Talents.onPick(r, this.modal.picks[idx].id);
      r.pendingPicks--;
      this.float('悟得：' + this.modal.picks[idx].name, '#ffe66d', 180, 300, 14);
      if (r.pendingPicks > 0) this.modal.picks = Talents.draw3(r);
      else { this.modal = null; this.state = 'fight'; }
      return;
    }
    if (this.modal && this.modal.kind === 'event') {
      const M = this.modal;
      if (M.resultText) {                              // 结果面板：继续 → 开门
        if (bid === 'ev_ok') {
          this.modal = null;
          this.state = 'clear';
          this._openDoors(Rogue.rollDoors());
        }
        return;
      }
      if (bid.startsWith('ev_ch')) {
        const idx = +bid.slice(5);
        M.resultText = Events.choose(r, M.ev, idx);
        Sfx.play('event');
      }
      return;
    }
    if (this.modal && this.modal.kind === 'bag' && bid.startsWith('use')) {
      const idx = +bid.slice(3);
      const id = r.items[idx];
      const text = id && Events.use(r, id);
      if (text) {
        Sfx.play('heal');
        this.float(text, '#a8e6cf', 180, 300, 12);
      }
      return;
    }
    if (this.modal && this.modal.kind === 'chest') {
      if (bid === 'ch_ok') {
        this.modal = null; this.state = 'clear'; this._openDoors(Rogue.rollDoors());
      }
      return;
    }
    if (this.modal && this.modal.kind === 'layer') {
      if (bid === 'ly_go') {
        const next = this.modal.nextLayer;
        this.modal = null;
        Main.startNextLayer(next);
      }
      return;
    }
    if (bid === 'idleBtn') this.idle = !this.idle;
    else if (bid === 'bagBtn') this.modal = { kind: 'bag' };
    else if (bid === 'bagClose') this.modal = null;
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    UI.begin();
    const R = CONFIG.ROOM, W = CONFIG.LOGICAL_W, r = Rogue.run;
    const C = CONFIG.CLASSES[r.cls];

    // ---- HUD ----
    ctx.fillStyle = '#12141f'; ctx.fillRect(0, 0, W, this.mapY);
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(`${C.name} Lv.${r.lv} · 第${r.layer}层`, 10, 20);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd166'; ctx.fillText(`功德 ${r.merit}`, W - 10, 20);
    ctx.fillStyle = '#c8a2ff'; ctx.fillText(`灵力 ${r.shenli}/${CONFIG.ROGUE.SHENLI_CAP}`, W - 10, 38);

    const mh = Talents.maxHp(r);
    ctx.fillStyle = '#10131f'; ctx.fillRect(10, 28, 150, 12);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(10, 28, 150 * U.clamp(r.hp / mh, 0, 1), 12);
    ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(`HP ${Math.ceil(r.hp)}/${mh}`, 14, 38);
    const need = xpNeed(r.lv);
    ctx.fillStyle = '#10131f'; ctx.fillRect(10, 46, 150, 8);
    ctx.fillStyle = '#3498db'; ctx.fillRect(10, 46, 150 * U.clamp(r.xp / need, 0, 1), 8);
    ctx.fillStyle = '#8f9bd4'; ctx.fillText(`经验 ${r.xp}/${need}`, 166, 54);

    // ---- 房间 ----
    ctx.save();
    if (this.shake > 0) ctx.translate(U.randInt(-1, 1) * this.shake, U.randInt(-1, 1) * this.shake);
    ctx.beginPath(); ctx.rect(-8, this.mapY - 8, W + 16, this.MH + 16); ctx.clip();
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-8, this.mapY - 8, W + 16, this.MH + 16);   // 震屏露边兜底
    for (let row = 0; row < R.ROWS; row++)
      for (let c = 0; c < R.COLS; c++) {
        ctx.fillStyle = (row + c) % 2 ? '#2d3230' : '#333835';
        ctx.fillRect(c * R.TILE, row * R.TILE + this.mapY, R.TILE, R.TILE);
      }
    // 门（清房后）
    if (this.state === 'clear') {
      for (const d of this.doors) {
        ctx.fillStyle = '#0e1018';
        ctx.fillRect(d.x - 30, this.mapY, 60, 26);
        ctx.fillStyle = d.type === 'boss' ? '#ff6b81' : d.type === 'elite' ? '#c8a2ff' : '#ffe66d';
        ctx.fillRect(d.x - 26, this.mapY + 2, 52, 22);
        ctx.fillStyle = '#1b1e2e';
        ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(d.label, d.x, this.mapY + 18);
        ctx.beginPath(); ctx.arc(d.x, this.mapY + 34, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const d of this.decor) Pixel.drawSprite(ctx, Pixel.sprites[d.s], d.x, d.y, 1.4);
    // 妖物
    for (const m of this.mobs) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(m.x, m.y - 2, 11 * m.scale / 1.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      const spr = m.variant === 'boss' ? Pixel.sprites.elite : Pixel.sprites['mob_' + m.variant];
      // 呼吸压扁：妖物有活着的感觉（各相位不同步）
      const squash = 1 + Math.sin(performance.now() / 170 + m.x * 0.07) * 0.045;
      Pixel.drawSprite(ctx, spr, m.x, m.y, m.scale, m.flash, squash);
      // 血条贴在精灵头顶上方（按实际精灵高度偏移）；满血小怪不画，减少画面噪音
      const barY = m.y - spr.height * m.scale - 7;
      const w = 28 * (m.scale / 1.5);
      if (m.hp < m.maxHp || m.boss || m.miniboss) {
        ctx.fillStyle = '#10131f'; ctx.fillRect(m.x - w / 2, barY, w, 5);
        ctx.fillStyle = m.boss || m.miniboss ? '#ff9f6b' : '#ff6b81';
        ctx.fillRect(m.x - w / 2, barY, w * U.clamp(m.hp / m.maxHp, 0, 1), 5);
      }
      if (m.affix) {
        ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe66d'; ctx.fillText('精英·' + m.affix, m.x, barY - 5);
      }
      if (m.miniboss) {
        ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ff9f6b'; ctx.fillText('守关妖', m.x, barY - 5);
      }
    }
    // 弹丸
    ctx.fillStyle = '#c8a2ff';
    for (const b of this.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    // 玩家
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(this.px, this.py - 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    Pixel.drawSprite(ctx, Pixel.sprites[r.cls], this.px, this.py, 1.3, this.playerFlash,
      1 + Math.sin(performance.now() / 150) * 0.03);
    // 头顶标记：一眼认出自己的角色（按职业配色，上下浮动）
    const bob = Math.sin(performance.now() / 180) * 2.5;
    const accent = { swordsman: '#4fc3dd', taoist: '#ffd166', monk: '#ffab5e' }[r.cls] || '#4fd6ff';
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(this.px, this.py - 60 + bob);
    ctx.lineTo(this.px - 5, this.py - 68 + bob);
    ctx.lineTo(this.px + 5, this.py - 68 + bob);
    ctx.closePath(); ctx.fill();
    // 粒子 / 光环 / 剑痕特效
    for (const p of this.parts) {
      const q = p.t / p.dur;
      ctx.globalAlpha = 1 - q;
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, U.lerp(p.r0, p.r1, q), 0, Math.PI * 2); ctx.stroke();
        if (p.color2) {
          ctx.strokeStyle = p.color2; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, U.lerp(p.r0, p.r1, q) * 0.7, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (p.line) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        const s = p.size * (1 - q * 0.5);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    // 飘字
    for (const f of this.floats) f.draw(ctx);
    ctx.restore();

    // 受伤红晕（不随震屏）
    if (this.hurtFx > 0) {
      ctx.fillStyle = `rgba(255,60,80,${(0.22 * this.hurtFx).toFixed(3)})`;
      ctx.fillRect(0, this.mapY, W, this.MH);
    }

    // 横幅
    if (this.banner) {
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,107,129,${U.clamp(this.banner.t, 0, 1)})`;
      ctx.fillText(this.banner.text, W / 2, 300);
      ctx.textAlign = 'left';
    }

    // ---- 底栏 ----
    ctx.fillStyle = '#12141f'; ctx.fillRect(0, this.mapY + this.MH, W, CONFIG.LOGICAL_H - this.mapY - this.MH);
    UI.button(ctx, 10, 586, 86, 40, this.idle ? '挂机：开' : '挂机：关', { id: 'idleBtn', color: this.idle ? '#1f6f43' : '#3a3f5c', size: 12 });
    UI.button(ctx, 104, 586, 86, 40, '行囊', { id: 'bagBtn', size: 12 });
    ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#6f7590';
    ctx.fillText(this.state === 'clear' ? '走进发光的门继续' : 'WASD/方向键移动 · J 普攻', W / 2, 636);
    ctx.textAlign = 'left';

    if (this.modal) this._drawModal(ctx);
  }

  _drawModal(ctx) {
    const W = CONFIG.LOGICAL_W, M = this.modal;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, CONFIG.LOGICAL_H);
    ctx.textAlign = 'center';
    if (M.kind === 'talent') {
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#ffe66d';
      ctx.fillText('悟得心法 · 择其一', W / 2, 120);
      M.picks.forEach((t, i) => {
        const x = 24 + i * 106, y = 170, w = 100, h = 170;
        UI.button(ctx, x, y, w, h, ' ', { id: 'talent' + i, color: '#2b3050' });
        ctx.font = 'bold 22px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#fff';
        ctx.fillText(t.name, x + w / 2, y + 50);
        ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#a8b3d8';
        const chars = t.desc.split('');
        let line = '', ln = 0;
        for (const ch of chars) { line += ch; if (line.length >= 7) { ctx.fillText(line, x + w / 2, y + 84 + ln * 18); line = ''; ln++; } }
        if (line) ctx.fillText(line, x + w / 2, y + 84 + ln * 18);
        ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#6f7590';
        ctx.fillText('轻触选取', x + w / 2, y + h - 12);
      });
    } else if (M.kind === 'event') {
      const w = 320, h = 300, x = (W - w) / 2, y = 160;
      ctx.fillStyle = '#232741'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#c8a2ff'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#ffe66d';
      ctx.fillText('奇遇 · ' + M.ev.title, W / 2, y + 36);
      // 正文（自动换行）
      ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c9cede';
      let line = '', ln = 0;
      for (const ch of M.ev.text) {
        line += ch;
        if (line.length >= 19) { ctx.fillText(line, W / 2, y + 62 + ln * 17); line = ''; ln++; }
      }
      if (line) ctx.fillText(line, W / 2, y + 62 + ln * 17);
      if (M.resultText) {
        // 结果
        ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#a8e6cf';
        line = ''; ln = 0;
        for (const ch of M.resultText) {
          line += ch;
          if (line.length >= 21) { ctx.fillText(line, W / 2, y + 150 + ln * 20); line = ''; ln++; }
        }
        if (line) ctx.fillText(line, W / 2, y + 150 + ln * 20);
        UI.button(ctx, x + 80, y + h - 56, w - 160, 38, '继 续', { id: 'ev_ok', color: '#1f6f43' });
      } else {
        // 抉择按钮
        M.ev.choices.forEach((c, i) => {
          UI.button(ctx, x + 30, y + 148 + i * 46, w - 60, 38, c.label, { id: 'ev_ch' + i, size: 13 });
        });
      }
      ctx.textAlign = 'left';
    } else if (M.kind === 'chest') {
      const w = 300, h = 170, x = (W - w) / 2, y = 220;
      ctx.fillStyle = '#232741'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#ffd166';
      ctx.fillText('开 箱', W / 2, y + 40);
      ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c9cede';
      ctx.fillText(`功德 +${M.merit} · 灵力 +${CONFIG.ROGUE.CHEST.shenli}`, W / 2, y + 72);
      if (M.heal) { ctx.fillStyle = '#2ecc71'; ctx.fillText('意外发现急救丹！HP 回满', W / 2, y + 96); }
      UI.button(ctx, x + 80, y + h - 52, w - 160, 36, '收下', { id: 'ch_ok' });
    } else if (M.kind === 'layer') {
      const w = 300, h = 170, x = (W - w) / 2, y = 220;
      ctx.fillStyle = '#232741'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#2ecc71';
      ctx.fillText(`第 ${M.nextLayer} 层`, W / 2, y + 42);
      ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c9cede';
      ctx.fillText(M.msg, W / 2, y + 72);
      ctx.fillText('HP 已回满，妖物更强，切莫大意。', W / 2, y + 94);
      UI.button(ctx, x + 80, y + h - 52, w - 160, 36, '深入', { id: 'ly_go', color: '#1f6f43' });
    } else if (M.kind === 'bag') {
      const w = 320, h = 500, x = (W - w) / 2, y = 78;
      ctx.fillStyle = '#232741'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#8f9bd4'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.textAlign = 'center';
      const rr = Rogue.run;
      // 心法
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#8f9bd4';
      ctx.fillText('· 已悟心法 ·', W / 2, y + 26);
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      const entries = Object.entries(rr.talents).slice(0, 7);
      if (!entries.length) { ctx.fillStyle = '#6f7590'; ctx.fillText('尚未悟得任何心法', W / 2, y + 48); }
      entries.forEach(([id, n], i) => {
        const t = Talents.byId(+id);
        ctx.fillStyle = '#a8b3d8'; ctx.textAlign = 'left';
        ctx.fillText(`${t.name} ×${n}`, x + 26, y + 48 + i * 19);
        ctx.textAlign = 'center';
      });
      // 功法
      const gy = y + 48 + Math.max(entries.length, 1) * 19 + 14;
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c8a2ff';
      ctx.fillText('· 所修功法 ·', W / 2, gy);
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      if (!rr.gongfa.length) { ctx.fillStyle = '#6f7590'; ctx.fillText('尚未修习功法', W / 2, gy + 22); }
      rr.gongfa.slice(0, 4).forEach((id, i) => {
        ctx.fillStyle = '#d8c8ff'; ctx.textAlign = 'left';
        ctx.fillText(`【${Events.GONGFA[id].name}】`, x + 26, gy + 22 + i * 18);
        ctx.textAlign = 'center';
      });
      // 道具（3 格，可使用）
      const iy = gy + 22 + Math.max(rr.gongfa.length, 1) * 18 + 14;
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#ffd166';
      ctx.fillText(`· 行囊 ${rr.items.length}/3 ·`, W / 2, iy);
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      if (!rr.items.length) { ctx.fillStyle = '#6f7590'; ctx.fillText('空空如也', W / 2, iy + 24); }
      rr.items.forEach((id, i) => {
        const it = Events.ITEMS[id];
        const ry = iy + 20 + i * 44;
        ctx.fillStyle = '#ffe8b0'; ctx.textAlign = 'left';
        ctx.fillText(it.name, x + 26, ry + 14);
        ctx.fillStyle = '#8f9bd4';
        ctx.fillText(it.desc, x + 26, ry + 30);
        ctx.textAlign = 'center';
        if (id !== 'hufu') UI.button(ctx, x + w - 82, ry, 60, 32, '使用', { id: 'use' + i, size: 12, color: '#1f6f43' });
        else { ctx.fillStyle = '#6f7590'; ctx.fillText('自动触发', x + w - 52, ry + 20); ctx.textAlign = 'center'; }
      });
      UI.button(ctx, x + 90, y + h - 46, w - 180, 32, '合上', { id: 'bagClose' });
    }
    ctx.textAlign = 'left';
  }
}
