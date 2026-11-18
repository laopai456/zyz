// ============================================================
// 俯视角挂机讨伐场景：自动寻怪/普攻/技能CD、讨伐任务、掉落与成长
// ============================================================
class WorldScene {
  constructor(callbacks) {
    this.cb = callbacks;               // { onStartBattle(cfg), onReset() }
    const W = CONFIG.WORLD;
    this.mapX = 0; this.mapY = 96;
    this.px = W.PLAYER_SPAWN.c * W.TILE + W.TILE / 2 + this.mapX;
    this.py = W.PLAYER_SPAWN.r * W.TILE + W.TILE / 2 + this.mapY;
    this.idle = false;
    this.invuln = 0;                   // 出生保护
    this.regenT = 0;                   // 脱战回血计时
    this.atkTimer = 0;
    this.skillCd = 0;
    this.playerFlash = 0;
    this.floats = [];
    this.modal = null;                 // {type:'elite'|'reset'}
    this.deathFx = 0;

    this.decor = [
      { s: 'tree', c: 2, r: 3 }, { s: 'tree', c: 6, r: 3 }, { s: 'tree', c: 3, r: 8 },
      { s: 'rock', c: 7, r: 7 }, { s: 'rock', c: 0, r: 6 }, { s: 'tree', c: 8, r: 10 },
    ];
    this._spawnAll();
  }

  get W() { return CONFIG.WORLD; }

  _spawnAll() {
    this.monsters = this.W.SPAWNS.map(sp => this._makeMonster(sp));
  }
  _makeMonster(sp) {
    const M = this.W.MONSTER;
    const home = { x: sp.c * this.W.TILE + this.W.TILE / 2 + this.mapX, y: sp.r * this.W.TILE + this.W.TILE / 2 + this.mapY };
    return {
      home,
      x: home.x, y: home.y, hp: M.HP, maxHp: M.HP,
      alive: true, respawnT: 0, atkTimer: 0,
      wanderT: 0, tx: home.x, ty: home.y, flash: 0,
    };
  }
  _respawn(m) {
    const M = this.W.MONSTER;
    m.alive = true; m.hp = M.HP; m.atkTimer = 0; m.wanderT = 0;
    m.x = m.home.x; m.y = m.home.y;
    this.floats.push(new FloatText(m.x, m.y - 20, '刷新', '#9aa0b5', { size: 10, dur: 0.8 }));
  }

  onEnter() {
    // 从消消战斗回来：同步共享 HP 池（战斗结束已回满）
    this.px = this.W.PLAYER_SPAWN.c * this.W.TILE + this.W.TILE / 2 + this.mapX;
    this.py = this.W.PLAYER_SPAWN.r * this.W.TILE + this.W.TILE / 2 + this.mapY;
    this.idle = false;
    this.invuln = 2;
  }

  playerHp() { return Save.data.hp; }
  playerMaxHp() { return heroMaxHp(Save.data.lv); }

  float(text, color, x = this.px, y = this.py - 26, size = 12) {
    this.floats.push(new FloatText(x, y, text, color, { size }));
  }

  // ---------- 更新 ----------
  update(dt) {
    const W = this.W, P = W.PLAYER;
    const keys = (typeof Main !== 'undefined' && Main.keys) || {};
    const ix = (keys['ArrowLeft'] || keys['a'] ? -1 : 0) + (keys['ArrowRight'] || keys['d'] ? 1 : 0);
    const iy = (keys['ArrowUp'] || keys['w'] ? -1 : 0) + (keys['ArrowDown'] || keys['s'] ? 1 : 0);

    if (ix || iy) this.idle = false;                    // 玩家移动打断挂机

    if (this.invuln > 0) this.invuln -= dt;
    if (this.playerFlash > 0) this.playerFlash = Math.max(0, this.playerFlash - dt * 3);
    this.atkTimer -= dt; this.skillCd -= dt; this.regenT += dt;
    if (this.regenT > 5 && Save.data.hp < this.playerMaxHp()) {   // 脱战缓慢回血
      Save.data.hp = Math.min(this.playerMaxHp(), Save.data.hp + 2 * dt);
    }

    // 手动移动
    if (ix || iy) {
      const l = Math.hypot(ix, iy) || 1;
      this.px = U.clamp(this.px + (ix / l) * P.SPEED * dt, this.mapX + 12, this.mapX + W.COLS * W.TILE - 12);
      this.py = U.clamp(this.py + (iy / l) * P.SPEED * dt, this.mapY + 14, this.mapY + W.ROWS * W.TILE - 4);
    }
    // 手动普攻（J）
    if (keys['j'] && this.atkTimer <= 0) this._attackNearest();

    // 挂机
    if (this.idle) this._autoTick(dt);

    // 怪物
    for (const m of this.monsters) {
      if (!m.alive) {
        m.respawnT -= dt;
        if (m.respawnT <= 0) this._respawn(m);
        continue;
      }
      if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 3);
      const M = W.MONSTER;
      const d = U.dist(m.x, m.y, this.px, this.py);
      if (d < M.AGGRO && this.invuln <= 0) {
        if (d > M.RANGE) {
          const k = M.SPEED * dt / (d || 1);
          m.x += (this.px - m.x) * k; m.y += (this.py - m.y) * k;
        } else {
          m.atkTimer -= dt;
          if (m.atkTimer <= 0) {
            m.atkTimer = M.ATK_INT;
            this._hurtPlayer(M.ATK, m);
          }
        }
      } else {                                        // 闲逛
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wanderT = U.randInt(15, 30) / 10;
          m.tx = m.home.x + U.randInt(-M.WANDER_R, M.WANDER_R);
          m.ty = m.home.y + U.randInt(-M.WANDER_R, M.WANDER_R);
        }
        const dw = U.dist(m.x, m.y, m.tx, m.ty);
        if (dw > 4) {
          const k = M.SPEED * 0.4 * dt / (dw || 1);
          m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k;
        }
      }
    }

    for (const f of this.floats) f.update(dt);
    this.floats = this.floats.filter(f => !f.dead);
  }

  _nearestAlive() {
    let best = null, bd = 1e9;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = U.dist(m.x, m.y, this.px, this.py);
      if (d < bd) { bd = d; best = m; }
    }
    return { m: best, d: bd };
  }

  _attackNearest() {
    const { m, d } = this._nearestAlive();
    if (!m || d > this.W.PLAYER.RANGE) return;
    const atk = heroAtk(Save.data.cls, Save.data.lv);
    m.hp -= atk; m.flash = 1;
    this.atkTimer = this.W.PLAYER.ATK_INT;
    this.regenT = 0;
    this.float(`-${atk}`, '#fff', m.x, m.y - 24);
    if (m.hp <= 0) this._kill(m);
  }

  _autoTick(dt) {
    const { m, d } = this._nearestAlive();
    if (!m) return;
    const P = this.W.PLAYER, C = this.W.CLASSES[Save.data.cls];
    if (d > P.RANGE) {                                  // 追击
      const k = P.SPEED * dt / (d || 1);
      this.px += (m.x - this.px) * k; this.py += (m.y - this.py) * k;
      return;
    }
    if (this.atkTimer <= 0) this._attackNearest();
    // 技能（CD 就绪就放）
    const S = C.skill;
    if (this.skillCd > 0) return;
    if (Save.data.cls === 'warrior' && d <= P.RANGE) {
      const dmg = Math.round(heroAtk(Save.data.cls, Save.data.lv) * S.mult);
      m.hp -= dmg; m.flash = 1;
      this.float(`猛击 -${dmg}`, '#ff9f6b', m.x, m.y - 34, 13);
      this.skillCd = S.cd; this.regenT = 0;
      if (m.hp <= 0) this._kill(m);
    } else if (Save.data.cls === 'mage') {
      let hitAny = false;
      const dmg = Math.round(heroAtk(Save.data.cls, Save.data.lv) * S.mult);
      for (const t of this.monsters) {
        if (!t.alive) continue;
        if (U.dist(t.x, t.y, this.px, this.py) <= S.radius) {
          t.hp -= dmg; t.flash = 1; hitAny = true;
          this.float(`-${dmg}`, '#c8a2ff', t.x, t.y - 24);
          if (t.hp <= 0) this._kill(t);
        }
      }
      if (hitAny) { this.float('火环！', '#c8a2ff', this.px, this.py - 34, 13); this.skillCd = S.cd; this.regenT = 0; }
    } else if (Save.data.cls === 'priest') {
      if (Save.data.hp < this.playerMaxHp() * S.hpGate) {
        const heal = Math.round(this.playerMaxHp() * S.healPct);
        Save.data.hp = Math.min(this.playerMaxHp(), Save.data.hp + heal);
        this.float(`治愈 +${heal}`, '#2ecc71', this.px, this.py - 34, 13);
        this.skillCd = S.cd;
        Save.flush();
      }
    }
  }

  _hurtPlayer(dmg, m) {
    if (this.invuln > 0) return;
    Save.data.hp = Math.max(0, Save.data.hp - dmg);
    this.playerFlash = 1; this.regenT = 0;
    this.float(`-${dmg}`, '#ff6b81', this.px, this.py - 26);
    if (Save.data.hp <= 0) this._playerDie();
  }

  _playerDie() {
    const W = this.W;
    Save.data.hp = this.playerMaxHp();                  // MVP 默认：死亡回城并回满
    Save.flush();
    this.px = W.PLAYER_SPAWN.c * W.TILE + W.TILE / 2 + this.mapX;
    this.py = W.PLAYER_SPAWN.r * W.TILE + W.TILE / 2 + this.mapY;
    this.idle = false;
    this.invuln = 2.5;
    this.deathFx = 1;
    FX.add(0.6, p => { this.deathFx = 1 - p; });
    this.float('死亡 · 回到出生点（进度保留）', '#ff6b81', this.px, this.py - 40, 13);
    // 把追过来的怪送回家
    for (const m of this.monsters) if (m.alive) { m.x = m.home.x; m.y = m.home.y; }
  }

  _kill(m) {
    const W = this.W;
    m.alive = false;
    m.respawnT = W.RESPAWN_SEC;
    const d = Save.data;
    d.xp += W.MONSTER.XP;
    d.gold += W.MONSTER.GOLD;
    d.divine = Math.min(W.DIVINE_CAP, d.divine + W.MONSTER.DIVINE);
    d.quest.kills++;
    this.float(`+${W.MONSTER.XP}经验`, '#a8e6cf', m.x, m.y - 30, 11);
    this.float(`+${W.MONSTER.GOLD}金币`, '#ffd166', m.x + 8, m.y - 16, 11);
    this.float(`+${W.MONSTER.DIVINE}神力`, '#c8a2ff', m.x - 8, m.y - 44, 11);
    while (d.xp >= xpNeed(d.lv)) {                      // 经验满自动升级
      d.xp -= xpNeed(d.lv);
      d.lv++;
      d.hp = Math.min(heroMaxHp(d.lv), d.hp + 10);
      this.float(`升级！Lv.${d.lv}`, '#ffe66d', this.px, this.py - 44, 15);
    }
    Save.flush();
  }

  _claimQuest() {
    const q = Save.data.quest;
    if (q.kills < q.goal) return;
    Save.data.gold += this.W.QUEST.REWARD_GOLD;
    q.round++; q.kills = 0; q.goal = this.W.QUEST.GOAL;
    Save.flush();
    this.float(`讨伐完成！+${this.W.QUEST.REWARD_GOLD}金币`, '#ffd166', CONFIG.LOGICAL_W / 2, 84, 13);
  }

  _tryEnter(cfg) {
    if (Save.data.unlocked < cfg.id) { this.float('通关第1战后解锁', '#9aa0b5'); return; }
    if (cfg.needHP && Save.data.hp < cfg.needHP) this.modal = { type: 'elite' };
    else this.cb.onStartBattle(cfg);
  }

  // ---------- 输入 ----------
  onClick(x, y) {
    const bid = UI.hit(x, y);
    if (!bid) return;
    if (this.modal) {
      if (bid === 'm_yes') {
        if (this.modal.type === 'reset') { Save.reset(); this.modal = null; this.cb.onReset(); return; }
        this.modal = null; this.cb.onStartBattle(CONFIG.BATTLE.LEVELS[1]);
      } else if (bid === 'm_no') this.modal = null;
      return;
    }
    if (bid === 'idleBtn') this.idle = !this.idle;
    else if (bid === 'b1') this._tryEnter(CONFIG.BATTLE.LEVELS[0]);
    else if (bid === 'b2') this._tryEnter(CONFIG.BATTLE.LEVELS[1]);
    else if (bid === 'claim') this._claimQuest();
    else if (bid === 'resetBtn') this.modal = { type: 'reset' };
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    UI.begin();
    const W = this.W, Wd = CONFIG.LOGICAL_W;
    const d = Save.data, C = W.CLASSES[d.cls];

    // ---- HUD ----
    ctx.fillStyle = '#12141f'; ctx.fillRect(0, 0, Wd, this.mapY);
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(`${C.name} Lv.${d.lv}`, 10, 20);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffd166'; ctx.textAlign = 'right';
    ctx.fillText(`金币 ${d.gold}`, Wd - 10, 20);
    ctx.fillStyle = '#c8a2ff';
    ctx.fillText(`神力 ${d.divine}/${W.DIVINE_CAP}`, Wd - 10, 38);

    // HP / XP 条
    const hpR = d.hp / this.playerMaxHp();
    ctx.fillStyle = '#10131f'; ctx.fillRect(10, 28, 150, 12);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(10, 28, 150 * hpR, 12);
    ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(`HP ${Math.ceil(d.hp)}/${this.playerMaxHp()}`, 14, 38);
    const need = xpNeed(d.lv);
    ctx.fillStyle = '#10131f'; ctx.fillRect(10, 46, 150, 8);
    ctx.fillStyle = '#3498db'; ctx.fillRect(10, 46, 150 * U.clamp(d.xp / need, 0, 1), 8);
    ctx.fillStyle = '#8f9bd4';
    ctx.fillText(`经验 ${d.xp}/${need}`, 166, 54);

    // 讨伐任务
    const q = d.quest, ready = q.kills >= q.goal;
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = ready ? '#ffe66d' : '#c9cede';
    ctx.fillText(`讨伐任务${q.round}：击杀 ${q.kills}/${q.goal}`, 10, 74);
    if (ready) UI.button(ctx, 200, 60, 100, 22, '领取奖励', { id: 'claim', color: '#7d5a2b', size: 11 });

    // ---- 地图 ----
    const MW = W.COLS * W.TILE, MH = W.ROWS * W.TILE;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, this.mapY, Wd, MH); ctx.clip();
    for (let r = 0; r < W.ROWS; r++)
      for (let c = 0; c < W.COLS; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#2d4a2f' : '#335536';
        ctx.fillRect(c * W.TILE + this.mapX, r * W.TILE + this.mapY, W.TILE, W.TILE);
      }
    for (const sp of W.SPAWNS) {                        // 刷新点标记
      const x = sp.c * W.TILE + W.TILE / 2 + this.mapX, y = sp.r * W.TILE + W.TILE / 2 + this.mapY;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
    }
    for (const dc of this.decor) {
      Pixel.drawSprite(ctx, Pixel.sprites[dc.s], dc.c * W.TILE + W.TILE / 2 + this.mapX, dc.r * W.TILE + W.TILE / 2 + this.mapY, 1.4);
    }
    // 怪物
    for (const m of this.monsters) {
      if (!m.alive) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(m.x, m.y - 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      Pixel.drawSprite(ctx, Pixel.sprites.slime, m.x, m.y, 1.5, m.flash);
      ctx.fillStyle = '#10131f'; ctx.fillRect(m.x - 14, m.y - 32, 28, 5);
      ctx.fillStyle = '#ff6b81'; ctx.fillRect(m.x - 14, m.y - 32, 28 * U.clamp(m.hp / m.maxHp, 0, 1), 5);
    }
    // 玩家
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(this.px, this.py - 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    Pixel.drawSprite(ctx, Pixel.sprites[d.cls], this.px, this.py, 1.8, this.playerFlash);
    if (this.deathFx > 0) {
      ctx.fillStyle = `rgba(255,80,80,${this.deathFx * 0.5})`;
      ctx.fillRect(0, this.mapY, Wd, MH);
    }
    ctx.restore();

    // ---- 底栏 ----
    ctx.fillStyle = '#12141f'; ctx.fillRect(0, this.mapY + MH, Wd, CONFIG.LOGICAL_H - this.mapY - MH);
    UI.button(ctx, 10, 586, 86, 40, this.idle ? '挂机：开' : '挂机：关', { id: 'idleBtn', color: this.idle ? '#1f6f43' : '#3a3f5c', size: 12 });
    UI.button(ctx, 104, 586, 76, 40, '第1战', { id: 'b1', size: 12 });
    UI.button(ctx, 188, 586, 76, 40, '第2战', { id: 'b2', enabled: d.unlocked >= 2, size: 12 });
    UI.button(ctx, 272, 586, 78, 40, '重置存档', { id: 'resetBtn', color: '#5c3a3a', size: 11 });
    ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#6f7590';
    ctx.fillText(this.idle ? '挂机中 · 移动即打断' : 'WASD/方向键移动 · J 普攻', Wd / 2, 636);
    ctx.textAlign = 'left';

    // 飘字（地图层内）
    ctx.save();
    ctx.beginPath(); ctx.rect(0, this.mapY, Wd, MH); ctx.clip();
    for (const f of this.floats) f.draw(ctx);
    ctx.restore();

    // 弹窗
    if (this.modal) this._drawModal(ctx);
  }

  _drawModal(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, CONFIG.LOGICAL_W, CONFIG.LOGICAL_H);
    const w = 300, h = 170, x = (CONFIG.LOGICAL_W - w) / 2, y = 220;
    ctx.fillStyle = '#232741'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8f9bd4'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#fff';
    if (this.modal.type === 'elite') {
      ctx.fillText('第2战 · 精英怪', CONFIG.LOGICAL_W / 2, y + 38);
      ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#ff6b81';
      ctx.fillText('等级不足，建议先练级', CONFIG.LOGICAL_W / 2, y + 70);
      ctx.fillStyle = '#c9cede'; ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`每回合固定伤害 10 点，当前 HP ${Math.ceil(Save.data.hp)}（建议≥150）`, CONFIG.LOGICAL_W / 2, y + 94);
      UI.button(ctx, x + 36, y + h - 50, 106, 36, '仍要进入', { id: 'm_yes', color: '#7d2b2b' });
      UI.button(ctx, x + w - 142, y + h - 50, 106, 36, '先练级', { id: 'm_no' });
    } else {
      ctx.fillText('重置存档', CONFIG.LOGICAL_W / 2, y + 38);
      ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c9cede';
      ctx.fillText('等级/金币/神力/进度全部清空，', CONFIG.LOGICAL_W / 2, y + 70);
      ctx.fillText('重新选择职业。确定？', CONFIG.LOGICAL_W / 2, y + 90);
      UI.button(ctx, x + 36, y + h - 50, 106, 36, '确认重置', { id: 'm_yes', color: '#7d2b2b' });
      UI.button(ctx, x + w - 142, y + h - 50, 106, 36, '取消', { id: 'm_no' });
    }
    ctx.textAlign = 'left';
  }
}
