// ============================================================
// 肉鸽 Run 状态机：层/房间流转、门选择、精英房配置、事件、结算
// ============================================================
const Rogue = {
  run: null,

  startRun(cls) {
    this.run = {
      cls, lv: 1, xp: 0,
      hp: heroMaxHp(1), maxHpBonus: 0,
      merit: 0, shenli: 0,
      talents: {},
      gongfa: [], items: [], seenEvents: [],     // 功法 / 道具(3格) / 已见事件
      layer: 1, kills: 0, pendingPicks: 0,
      layerState: null, doors: [],
      ambushMerit: 0,
    };
    this._enterLayer(1);
  },

  _layerCounts(layer) {
    const c = CONFIG.ROGUE.LAYER_CFG[layer - 1];
    return { combat: c.combat, elite: c.elite, event: c.event, chest: c.chest, boss: c.boss };
  },

  _enterLayer(layer) {
    const r = this.run;
    r.layer = layer;
    r.layerState = { remaining: this._layerCounts(layer), combatCleared: 0, eliteUsed: false };
    r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + Talents.layerShenli(r));
    r.doors = [];                                   // 每层第一房固定战斗房
  },

  // 清房后掷两扇门（BOSS 唯一终点、精英房中段后出现；保证至少一扇战斗房）
  rollDoors() {
    const ls = this.run.layerState;
    const avail = [];
    for (const t of ['combat', 'event', 'chest']) if (ls.remaining[t] > 0) avail.push(t);
    if (ls.remaining.elite > 0 && !ls.eliteUsed && ls.combatCleared >= 2) avail.push('elite');
    if (!avail.length) return ['boss'];              // 只剩 BOSS：单门终点
    for (let i = avail.length - 1; i > 0; i--) { const j = U.randInt(0, i); [avail[i], avail[j]] = [avail[j], avail[i]]; }
    const doors = avail.slice(0, 2);
    if (!doors.includes('combat') && avail.includes('combat')) doors[doors.length - 1] = 'combat';
    return doors;
  },

  enterRoom(type) {
    const r = this.run, ls = r.layerState;
    ls.remaining[type]--;
    if (type === 'combat') ls.combatCleared++;
    if (type === 'elite') ls.eliteUsed = true;
    r.doors = [];
    const L = CONFIG.ROGUE.LAYER_CFG[r.layer - 1];

    if (type === 'combat') {
      const count = U.randInt(...CONFIG.ROGUE.MOBS_PER_ROOM);
      const mobs = [];
      for (let i = 0; i < count; i++) {
        const variant = U.pick(L.mobPool);
        mobs.push({ variant, elite: i === 0 && Math.random() < L.eliteChance });
      }
      return { type, layer: r.layer, mobs };
    }
    if (type === 'boss') {
      if (r.layer < 3) {
        const variant = U.pick(L.mobPool);
        return { type: 'boss', layer: r.layer, mobs: [{ variant, elite: false, miniboss: true }] };
      }
      return { type: 'boss', layer: 3, mobs: [], boss: true };
    }
    if (type === 'event') {
      return { type: 'event', layer: r.layer };
    }
    if (type === 'chest') return { type: 'chest', layer: r.layer };
    return { type: 'combat', layer: r.layer, mobs: [{ variant: 'green', elite: false }] };
  },

  // 精英房消消配置（应用天赋修饰）+ 英雄快照
  eliteSetup() {
    const r = this.run;
    const base = CONFIG.BATTLE.LEVELS[r.layer - 1];
    const cfg = {
      ...base,
      slashes: Math.max(5, base.slashes - Talents.eliteSlashCut(r)),
      cascadeBonus: Talents.cascadeBonus(r),
      burnTurns: Talents.burnTurns(r),
      priestErrBonus: Talents.priestErrBonus(r),
      ultUses: base.ultUses + Talents.ultAddUses(r),
      eliteRoom: true,
    };
    const hero = { cls: r.cls, hp: r.hp, maxHp: Talents.maxHp(r), divine: r.shenli };
    return { cfg, hero };
  },

  // 精英房结算（由 battle 的 onEnd 回调驱动）
  eliteEnd(result, hero) {
    const r = this.run;
    r.shenli = hero.divine;                          // 灵力消耗带回
    r.hp = Talents.maxHp(r);                         // 无论胜败回满
    if (result === 'win') {
      r.merit += CONFIG.ROGUE.ELITE_WIN.merit;
      r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + CONFIG.ROGUE.ELITE_WIN.shenli);
    } else {
      r.merit = Math.max(0, r.merit - CONFIG.ROGUE.ELITE_LOSE_PENALTY);
    }
  },

  gainKill(reward = {}) {
    const r = this.run;
    r.kills++;
    this.gainXp(CONFIG.ROGUE.XP_PER_KILL);
    r.merit += (reward.merit ?? CONFIG.ROGUE.MERIT_PER_KILL);
    r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + (reward.shenli ?? CONFIG.ROGUE.SHENLI_PER_KILL));
    if (Talents.vampHeal(r) > 0) r.hp = Math.min(Talents.maxHp(r), r.hp + Talents.vampHeal(r));
  },

  gainXp(n) {
    const r = this.run;
    r.xp += n;
    while (r.xp >= xpNeed(r.lv)) {
      r.xp -= xpNeed(r.lv);
      r.lv++;
      r.hp = Talents.maxHp(r);                       // 升级回满
      r.pendingPicks++;
    }
  },

  hurtPlayer(n) {
    const r = this.run;
    let dmg = Math.max(1, Math.round(n * Talents.damageCut(r)));
    if (Events.has(r, 'guixi')) dmg = Math.max(1, Math.round(dmg * 0.75));   // 龟息功
    if (Events.has(r, 'chiyang')) dmg += 2;                                  // 赤阳功反噬
    r.hp = Math.max(0, r.hp - dmg);
    return r.hp <= 0;                                // true = 死亡
  },

  openChest() {
    const r = this.run, C = CONFIG.ROGUE.CHEST;
    const merit = U.randInt(C.meritMin, C.meritMax);
    r.merit += merit;
    r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + C.shenli);
    const heal = Math.random() < C.healChance;
    if (heal) r.hp = Talents.maxHp(r);
    return { merit, heal };
  },

  // ---- 层与结算 ----
  onBossCleared() {
    const r = this.run;
    r.hp = Talents.maxHp(r);
    if (r.layer < 3) {
      const rew = CONFIG.ROGUE.MINIBOSS.reward[r.layer - 1];
      r.merit += rew.merit;
      r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + rew.shenli);
      return { nextLayer: r.layer + 1, msg: `守关妖伏诛！+${rew.merit}功德 +${rew.shenli}灵力` };
    }
    r.merit += CONFIG.ROGUE.BOSS.reward.merit;
    r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + CONFIG.ROGUE.BOSS.reward.shenli);
    return { win: true, msg: `妖王授首！+${CONFIG.ROGUE.BOSS.reward.merit}功德 +${CONFIG.ROGUE.BOSS.reward.shenli}灵力` };
  },

  finishRun() {
    const r = this.run;
    const win = r.won === true;
    if (win) Save.addMerit(CONFIG.ROGUE.BOSS.clearBonus);
    Save.addMerit(r.merit);
    Save.recordLayer(win ? 3 : r.layer);
    return {
      win, merit: r.merit + (win ? CONFIG.ROGUE.BOSS.clearBonus : 0),
      layer: r.layer, lv: r.lv, kills: r.kills,
      talents: Object.entries(r.talents).map(([id, n]) => ({ t: Talents.byId(+id), n })),
      gongfa: (r.gongfa || []).map(id => Events.GONGFA[id].name),
      items: (r.items || []).map(id => Events.ITEMS[id].name),
    };
  },
};
