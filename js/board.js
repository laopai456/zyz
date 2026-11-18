// ============================================================
// 消消棋盘纯逻辑（无渲染、无输入，便于后续直接移植小游戏）
// grid[r][c]：null=空位（消除后待下落）、-1=锁块、0..COLORS-1=方块颜色
// ============================================================
class Board {
  constructor(cfg, lockCount = 0) {
    this.COLS = cfg.COLS; this.ROWS = cfg.ROWS; this.COLORS = cfg.COLORS;
    this.generate(lockCount);
  }

  randGem() { return U.randInt(0, this.COLORS - 1); }

  generate(lockCount) {
    for (let tries = 0; tries < 60; tries++) {
      const g = Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(null));
      // 随机撒锁块
      const all = [];
      for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) all.push({ r, c });
      for (let i = all.length - 1; i > 0; i--) { const j = U.randInt(0, i); [all[i], all[j]] = [all[j], all[i]]; }
      for (let i = 0; i < Math.min(lockCount, all.length); i++) g[all[i].r][all[i].c] = -1;
      // 填充方块：避免开局自然三连
      for (let r = 0; r < this.ROWS; r++) {
        for (let c = 0; c < this.COLS; c++) {
          if (g[r][c] === -1) continue;
          let v;
          do { v = this.randGem(); }
          while ((c >= 2 && g[r][c - 1] === v && g[r][c - 2] === v) ||
                 (r >= 2 && g[r - 1][c] === v && g[r - 2][c] === v));
          g[r][c] = v;
        }
      }
      this.grid = g;
      if (this.hasMove()) return true;
    }
    return false; // 理论上到不了
  }

  inRange(c, r) { return c >= 0 && c < this.COLS && r >= 0 && r < this.ROWS; }
  isGem(c, r) { return this.inRange(c, r) && this.grid[r][c] !== null && this.grid[r][c] !== -1; }

  // 相邻且双方都是普通方块才能交换
  canSwap(a, b) {
    const adj = Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;
    return adj && this.isGem(a.c, a.r) && this.isGem(b.c, b.r);
  }

  swap(a, b) {
    const g = this.grid;
    [g[a.r][a.c], g[b.r][b.c]] = [g[b.r][b.c], g[a.r][a.c]];
  }

  // 找所有横/竖 ≥3 连（返回 [{cells:[{c,r}], len}]）
  findRuns() {
    const g = this.grid, runs = [];
    for (let r = 0; r < this.ROWS; r++) {
      let c = 0;
      while (c < this.COLS) {
        const v = g[r][c];
        if (v === null || v === -1) { c++; continue; }
        let e = c;
        while (e + 1 < this.COLS && g[r][e + 1] === v) e++;
        if (e - c + 1 >= 3) {
          const cells = []; for (let i = c; i <= e; i++) cells.push({ c: i, r });
          runs.push({ cells, len: e - c + 1 });
        }
        c = e + 1;
      }
    }
    for (let c = 0; c < this.COLS; c++) {
      let r = 0;
      while (r < this.ROWS) {
        const v = g[r][c];
        if (v === null || v === -1) { r++; continue; }
        let e = r;
        while (e + 1 < this.ROWS && g[e + 1][c] === v) e++;
        if (e - r + 1 >= 3) {
          const cells = []; for (let i = r; i <= e; i++) cells.push({ c, r: i });
          runs.push({ cells, len: e - r + 1 });
        }
        r = e + 1;
      }
    }
    return runs;
  }

  // 刀数表：3消=1刀 4消=2刀 5消+=3刀
  static slashFor(len) { return len >= 5 ? 3 : len === 4 ? 2 : 1; }

  // 交换后是否立刻有消除（不改变棋盘）
  swapMakesMatch(a, b) {
    if (!this.canSwap(a, b)) return false;
    this.swap(a, b);
    const ok = this.findRuns().length > 0;
    this.swap(a, b);
    return ok;
  }

  hasMove() {
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        if (c + 1 < this.COLS && this.swapMakesMatch({ c, r }, { c: c + 1, r })) return true;
        if (r + 1 < this.ROWS && this.swapMakesMatch({ c, r }, { c, r: r + 1 })) return true;
      }
    }
    return false;
  }

  // 无解自动重排：重排后保证无自然三连且有解；不消耗回合
  shuffle() {
    for (let tries = 0; tries < 80; tries++) {
      const cells = [];
      for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) if (this.isGem(c, r)) cells.push({ c, r });
      const colors = cells.map(({ c, r }) => this.grid[r][c]);
      for (let i = colors.length - 1; i > 0; i--) { const j = U.randInt(0, i); [colors[i], colors[j]] = [colors[j], colors[i]]; }
      cells.forEach(({ c, r }, i) => { this.grid[r][c] = colors[i]; });
      if (!this.findRuns().length && this.hasMove()) return true;
    }
    // 兜底：保持锁块，按“避免三连”的方式重新生成颜色
    const locks = [];
    for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) if (this.grid[r][c] === -1) locks.push({ c, r });
    this.generate(locks.length);
    return true;
  }

  // 清除一组格子（置 null）
  clearCells(cellSet) {
    for (const key of cellSet) {
      const c = key % this.COLS, r = Math.floor(key / this.COLS);
      this.grid[r][c] = null;
    }
  }

  // 下落补齐：锁块分段，段内下沉、段顶生成新块。
  // moves 含全部幸存块（含未移动的，便于视图重建），spawns 含新块及出生高度
  collapsePlan() {
    const moves = [], spawns = [];
    const g = this.grid;
    for (let c = 0; c < this.COLS; c++) {
      let segStart = 0;
      for (let r = 0; r <= this.ROWS; r++) {
        if (r !== this.ROWS && g[r][c] !== -1) continue;
        // 段 [segStart, r-1]
        const gems = [];
        for (let rr = r - 1; rr >= segStart; rr--) {
          if (g[rr][c] !== null && g[rr][c] !== -1) gems.push({ fromR: rr, color: g[rr][c] });
        }
        let toR = r - 1;
        for (const gm of gems) {
          if (g[toR][c] !== null) g[toR][c] = null;
          if (gm.fromR !== toR) g[gm.fromR][c] = null;
          g[toR][c] = gm.color;
          moves.push({ c, fromR: gm.fromR, toR, color: gm.color });
          toR--;
        }
        const emptyRows = [];
        for (let rr = segStart; rr <= toR; rr++) emptyRows.push(rr);
        emptyRows.forEach((rr, i) => {
          const color = this.randGem();
          g[rr][c] = color;
          spawns.push({ c, toR: rr, color, startR: segStart - (emptyRows.length - i) - 1 });
        });
        segStart = r + 1;
      }
    }
    return { moves, spawns };
  }

  // 牧师 Perfect：解锁切比雪夫距离 radius 内的锁块，填成不引发三连的颜色
  unlockRadius(c0, r0, radius) {
    let n = 0;
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (this.inRange(c, r) && this.grid[r][c] === -1) { this.fillNoMatch(c, r); n++; }
      }
    }
    return n;
  }

  fillNoMatch(c, r) {
    for (let t = 0; t < 40; t++) {
      this.grid[r][c] = this.randGem();
      if (!this.runAt(c, r)) return true;
    }
    return true;
  }

  // (c,r) 处是否构成三连（用于解锁填充）
  runAt(c, r) {
    const g = this.grid, v = g[r][c];
    if (v === null || v === -1) return false;
    let n = 1;
    for (let i = c - 1; i >= 0 && g[r][i] === v; i--) n++;
    for (let i = c + 1; i < this.COLS && g[r][i] === v; i++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let i = r - 1; i >= 0 && g[i][c] === v; i--) n++;
    for (let i = r + 1; i < this.ROWS && g[i][c] === v; i++) n++;
    return n >= 3;
  }
}
