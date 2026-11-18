// ============================================================
// 存档 v2：只持久化 Meta（功德 / 参悟进度 / 最高层）
// Run 内状态不持久化（退出即作废）
// ============================================================
const Save = {
  data: null,

  fresh() {
    return { ver: 2, merit: 0, bestLayer: 0, sfx: true, unlockedTalents: [1, 2, 3, 4, 5, 6, 7, 8] };
  },

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.ver === 2) {
          d.merit = Math.max(0, d.merit | 0);
          d.bestLayer = Math.max(0, d.bestLayer | 0);
          if (d.sfx === undefined) d.sfx = true;
          if (!Array.isArray(d.unlockedTalents) || !d.unlockedTalents.length) d.unlockedTalents = [1,2,3,4,5,6,7,8];
          this.data = d;
          return true;
        }
      }
      // 旧档（v1 或无法识别）：金币 ×10 折算功德
      let merit = 0, bestLayer = 0;
      try {
        const old = JSON.parse(localStorage.getItem('pixel-arpg-save-v1') || 'null');
        if (old && typeof old.gold === 'number') {
          merit += old.gold * 10;
          bestLayer = old.unlocked >= 2 ? 1 : 0;
        }
      } catch (e) { /* 忽略旧档 */ }
      this.data = { ver: 2, merit, bestLayer, sfx: true, unlockedTalents: [1,2,3,4,5,6,7,8] };
      this.flush();
      return true;
    } catch (e) {
      this.data = this.fresh();
      return true;
    }
  },

  flush() {
    try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* 隐私模式忽略 */ }
  },

  reset() {
    try { localStorage.removeItem(CONFIG.SAVE_KEY); localStorage.removeItem('pixel-arpg-save-v1'); } catch (e) { }
    this.data = this.fresh();
    this.flush();
  },

  addMerit(n) { this.data.merit = Math.max(0, this.data.merit + n); this.flush(); },
  recordLayer(layer) { if (layer > this.data.bestLayer) { this.data.bestLayer = layer; this.flush(); } },
};
