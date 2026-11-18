// ============================================================
// 天赋系统：数据、三选一抽取、效果应用
// ============================================================
const Talents = {
  DATA: [
    { id: 1,  name: '利刃',     desc: 'ATK +20%',                        max: 3, unlock: 0 },
    { id: 2,  name: '迅捷',     desc: '攻速 +15%',                       max: 3, unlock: 0 },
    { id: 3,  name: '强体',     desc: 'maxHP +30 并回满',                max: 3, unlock: 0 },
    { id: 4,  name: '疾风步',   desc: '移速 +20%',                       max: 2, unlock: 0 },
    { id: 5,  name: '吸血',     desc: '击杀回复 4 HP',                   max: 3, unlock: 0 },
    { id: 6,  name: '磨刀',     desc: '进精英房时妖物刀数 −3',           max: 2, unlock: 0 },
    { id: 7,  name: '连斩',     desc: '消消连锁加成 +1刀 → +2刀',        max: 1, unlock: 0 },
    { id: 8,  name: '大招大师', desc: '精英房大招次数 +1',               max: 2, unlock: 0 },
    { id: 9,  name: '血怒',     desc: 'HP<50% 时伤害 +30%',              max: 1, unlock: 60 },
    { id: 10, name: '溅射',     desc: '普攻溅射周围 1.5 格 30% 伤害',    max: 2, unlock: 60 },
    { id: 11, name: '铁骨',     desc: '受到伤害 −15%',                   max: 2, unlock: 80 },
    { id: 12, name: '余烬',     desc: '灼烧持续 +1 回合',                max: 1, unlock: 80 },
    { id: 13, name: '稳手',     desc: '同心祈祷 Perfect 误差阈 +3px',    max: 1, unlock: 100 },
    { id: 14, name: '灵力贪食', desc: '每层开始 +2 灵力',                max: 2, unlock: 120 },
  ],
  FILLER: { id: 0, name: '香火缘', desc: '功德 +30', max: 99 },

  byId(id) { return this.DATA.find(t => t.id === id); },

  // Run 的天赋计数 {id:count}
  count(run, id) { return run.talents[id] || 0; },
  add(run, id) {
    if (id === 0) { run.merit += 30; return; }
    run.talents[id] = (run.talents[id] || 0) + 1;
  },

  // 三选一：从未达上限的已解锁天赋中抽 3；不足用香火缘填充
  draw3(run) {
    const pool = this.DATA.filter(t =>
      Save.data.unlockedTalents.includes(t.id) && this.count(run, t.id) < t.max);
    for (let i = pool.length - 1; i > 0; i--) { const j = U.randInt(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picks = pool.slice(0, 3);
    while (picks.length < 3) picks.push(this.FILLER);
    return picks;
  },

  // ---- 属性/战斗修饰统一出口（room/battle 均从这里取） ----
  atkMult(run)      { return (1 + 0.20 * this.count(run, 1)) * (Events.has(run, 'chiyang') ? 1.25 : 1); },
  atkIntMult(run)   { return Math.pow(0.85, this.count(run, 2)); },      // 攻速+15%/层
  speedMult(run)    { return (1 + 0.20 * this.count(run, 4)) * (Events.has(run, 'yufeng') ? 1.3 : 1); },
  vampHeal(run)     { return 4 * this.count(run, 5); },
  eliteSlashCut(run){ return 3 * this.count(run, 6); },
  cascadeBonus(run) { return 1 + this.count(run, 7); },
  ultAddUses(run)   { return this.count(run, 8); },
  bloodRage(run)    { return this.count(run, 9) > 0; },
  splashMult(run)   { return this.count(run, 10) > 0 ? 0.3 + 0.3 * (this.count(run, 10) - 1) : 0; },
  damageCut(run)    { return 1 - 0.15 * this.count(run, 11); },
  burnTurns(run)    { return CONFIG.BATTLE.BURN_TURNS + this.count(run, 12); },
  priestErrBonus(run){ return 3 * this.count(run, 13); },
  layerShenli(run)  { return 2 * this.count(run, 14); },
  cdMult(run)       { return Events.has(run, 'jianxin') ? 0.7 : 1; },   // 剑心通明

  // 拾取即时生效的部分（其余在战斗中按需读取）
  onPick(run, id) {
    this.add(run, id);
    if (id === 3) { run.maxHpBonus += 30; run.hp = this.maxHp(run); }
  },
  maxHp(run) { return heroMaxHp(run.lv) + run.maxHpBonus + (Events.has(run, 'jingang') ? 40 : 0); },
  atk(run) {
    let a = heroAtk(run.cls, run.lv) * this.atkMult(run);
    if (this.bloodRage(run) && run.hp < this.maxHp(run) * 0.5) a *= 1.3;
    return Math.round(a);
  },
};
