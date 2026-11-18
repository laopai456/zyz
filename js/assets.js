// ============================================================
// AI 素材加载层：assets/ 下存在对应 PNG 时自动替换矢量立绘，
// 缺失/加载失败则静默回退 Pixel 矢量烘焙（游戏永远可跑）。
// 目录约定（方形透明 PNG，人物脚底贴边、四周留白会被自动裁掉）：
//   assets/portraits/{swordsman,taoist,monk}.png      建议 512+ 方形
//   assets/sprites/{职业+妖物名}.png                    全身像
// 注意：自动裁透明边依赖 getImageData，file:// 下 canvas 会被
// 污染而抛错——此时跳过裁剪用整图（http://127.0.0.1 下正常）。
// ============================================================
const Assets = {
  LOGICAL: {
    sprites: { swordsman: 48, taoist: 48, monk: 48, elite: 32,
      mob_green: 24, mob_red: 24, mob_purple: 24, mob_gold: 24, tree: 24, rock: 24 },
    portraits: { swordsman: 64, taoist: 64, monk: 64 },
  },

  load() {
    for (const [name, size] of Object.entries(this.LOGICAL.sprites))
      this._load('sprites', name, size, size);
    for (const [name, size] of Object.entries(this.LOGICAL.portraits))
      this._load('portraits', name, size, size);
  },

  _load(kind, name, lw, lh) {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = this._normalize(img, lw, lh);
        if (kind === 'sprites') Pixel.sprites[name] = cv;
        else Pixel.portraits[name] = cv;
        console.log('AI素材已接入:', kind + '/' + name);
      } catch (e) {
        console.warn('素材接入失败，回退矢量:', name, e.message);
      }
    };
    img.onerror = () => { /* 无素材 → 保持矢量 */ };
    img.src = `assets/${kind}/${name}.png?v=${Date.now()}`;
  },

  // 裁透明边 → 等比缩进逻辑框 → 底部居中锚点 → 高清画布（逻辑尺寸覆盖保持旧缩放数学）
  _normalize(img, lw, lh) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) throw new Error('empty image');
    let sx = 0, sy = 0, sw = iw, sh = ih;
    try {
      const m = document.createElement('canvas');
      m.width = iw; m.height = ih;
      const mc = m.getContext('2d');
      mc.drawImage(img, 0, 0);
      const d = mc.getImageData(0, 0, iw, ih).data;
      let minX = iw, minY = ih, maxX = -1, maxY = -1;
      for (let y = 0; y < ih; y++)
        for (let x = 0; x < iw; x++)
          if (d[(y * iw + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      if (maxX > minX && maxY > minY) { sx = minX; sy = minY; sw = maxX - minX + 1; sh = maxY - minY + 1; }
    } catch (e) { /* file:// 污染：跳过裁剪 */ }

    const RES = 8;
    const scale = Math.min(lw / sw, lh / sh);
    const dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement('canvas');
    cv.width = lw * RES; cv.height = lh * RES;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(img, sx, sy, sw, sh, (lw - dw) / 2 * RES, (lh - dh) * RES, dw * RES, dh * RES);
    // 受击闪白剪影（drawSprite 的 flash 依赖 _white）
    const wt = document.createElement('canvas');
    wt.width = cv.width; wt.height = cv.height;
    const wc = wt.getContext('2d');
    wc.drawImage(cv, 0, 0);
    wc.globalCompositeOperation = 'source-in';
    wc.fillStyle = '#fff'; wc.fillRect(0, 0, wt.width, wt.height);
    cv._white = wt;
    Object.defineProperty(cv, 'width', { value: lw });
    Object.defineProperty(cv, 'height', { value: lh });
    return cv;
  },
};
