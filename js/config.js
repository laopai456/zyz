// ============================================================
// 数值默认表 v5 —— 国风肉鸽跑图 + 消消精英房
// 设计文档未定的数值全部集中在这里，改这里即可调参
// ============================================================
const CONFIG = {
  LOGICAL_W: 360,          // 逻辑分辨率（竖屏手机比例）
  LOGICAL_H: 640,
  SAVE_KEY: 'pixel-arpg-save-v2',

  // ---------------- 地牢房间 ----------------
  ROOM: {
    TILE: 40,
    COLS: 9, ROWS: 12,     // 单屏房间 360x480（y 96..576）
    DECOR: 4,              // 每房间装饰（树/石）数量，带碰撞
  },

  // ---------------- 肉鸽 Run ----------------
  ROGUE: {
    LAYERS: 3,
    // 每层构成与难度系数
    LAYER_CFG: [
      { combat: 4, elite: 1, event: 1, chest: 0, boss: 1, mult: 1.0,
        mobPool: ['green', 'red'], eliteChance: 0, roomCount: 7 },
      { combat: 4, elite: 1, event: 2, chest: 0, boss: 1, mult: 1.6,
        mobPool: ['green', 'red', 'purple'], eliteChance: 0.3, roomCount: 8 },
      { combat: 4, elite: 1, event: 2, chest: 1, boss: 1, mult: 2.2,
        mobPool: ['green', 'red', 'purple', 'gold'], eliteChance: 0.3, roomCount: 9 },
    ],
    // 妖物变体（复用史莱姆 AI 改参数）
    MOBS: {
      green:  { hp: 30, atk: 5, speed: 45, scale: 1.3, drop: 1, atkInt: 1.5, range: 24 },
      red:    { hp: 21, atk: 4, speed: 72, scale: 1.15, drop: 1, atkInt: 1.3, range: 24 },
      purple: { hp: 24, atk: 6, speed: 36, scale: 1.3, drop: 1, atkInt: 2.2, range: 24,
                ranged: { keepDist: 90, bulletSpeed: 120, interval: 2.0 } },
      gold:   { hp: 75, atk: 8, speed: 27, scale: 1.5, drop: 3, atkInt: 1.8, range: 26 },
    },
    ELITE_AFFIX: { statMult: 1.8, scaleMult: 1.3, dropMult: 3, chance: 0.3 },
    MINIBOSS: { statMult: 3, scaleMult: 1.5,
                reward: [{ merit: 40, shenli: 2 }, { merit: 60, shenli: 3 }] },
    BOSS: { hp: 320, atk: 15, speed: 40, scale: 2.4,
            summonHpPct: 0.2, summonCount: 2, summonCap: 4,
            reward: { merit: 120, shenli: 5 }, clearBonus: 100 },
    MOBS_PER_ROOM: [3, 5],   // 战斗房妖物数量范围
    XP_PER_KILL: 8, MERIT_PER_KILL: 3, SHENLI_PER_KILL: 1, SHENLI_CAP: 20,
    ELITE_WIN: { merit: 25, shenli: 3 },
    ELITE_LOSE_PENALTY: 20,
    AMBUSH: { count: 3, merit: 20 },
    CHEST: { meritMin: 40, meritMax: 80, shenli: 2, healChance: 0.2 },
  },

  // ---------------- 国风三职业（战斗房技能） ----------------
  CLASSES: {
    swordsman: { name: '剑客', atkBase: 12, skill: { name: '破风斩', mult: 2.5, cd: 5 } },
    taoist:    { name: '道士', atkBase: 9,  skill: { name: '撒火符', mult: 1.2, cd: 6, radius: 80 } },
    monk:      { name: '和尚', atkBase: 8,  skill: { name: '佛法回春', healPct: 0.25, cd: 8, hpGate: 0.7 } },
  },
  PLAYER: { SPEED: 75, RANGE: 36, ATK_INT: 0.9 },

  // ---------------- 消消棋盘 ----------------
  BOARD: { COLS: 7, ROWS: 7, COLORS: 5, CELL: 44 },

  // ---------------- 消消精英房（逐层） ----------------
  BATTLE: {
    CASCADE_BONUS: 1,        // 每次连锁下落再消 额外+1刀（天赋连斩→2）
    BURN_TURNS: 3,           // 灼烧持续（天赋余烬→4）
    SLASH_FIXED: 3,          // 剑客剑痕固定3刀
    // 层1/层2 基础配置；层3 由 rogue 派生
    LEVELS: [
      { id: 1, name: '精英房·缚妖阵（壹）', slashes: 20, dmgPerTurn: 5,
        locks: 0, ultUses: 3, ultCost: 1, monsterScale: 2.2, monsterSprite: 'mob_green' },
      { id: 2, name: '精英房·缚妖阵（贰）', slashes: 45, dmgPerTurn: 10,
        locks: 3, ultUses: 3, ultCost: 2, monsterScale: 2.6, monsterSprite: 'elite' },
      { id: 3, name: '精英房·缚妖阵（叁）', slashes: 60, dmgPerTurn: 13,
        locks: 4, ultUses: 3, ultCost: 2, monsterScale: 2.8, monsterSprite: 'elite' },
    ],
    // 和尚同心祈祷
    PRIEST: {
      SHRINK_SEC: 1.4, COLLAPSE_SEC: 0.45,
      RADIUS_START: 90, RADIUS_TARGET: 14,
      ERR_PERFECT: 5, ERR_GOOD: 10, ERR_BAD: 18,
      MOVE_MISS: 16, UNLOCK_RADIUS: 2,
      DMG: { perfect: 5, good: 3, bad: 1, miss: 0 },
    },
    // 道士咏唱灼烧
    MAGE: {
      SWEEP_SEC: 1.6, PERFECT_HALF: 0.06, GOOD_HALF: 0.16,
      DMG: { perfect: 2, good: 2, bad: 1 },
    },
    ULT_LABEL: {
      swordsman: '剑痕斩击·划线', monk: '同心祈祷·长按', taoist: '咏唱灼烧·读条',
    },
  },

  GEM_COLORS: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'],
};

// 派生数值：maxHP / 当前ATK / 升级需求
function heroMaxHp(lv) { return 60 + 10 * (lv - 1); }
function heroAtk(cls, lv) { return CONFIG.CLASSES[cls].atkBase + 2 * (lv - 1); }
function xpNeed(lv) { return 10 + 8 * (lv - 1); }
