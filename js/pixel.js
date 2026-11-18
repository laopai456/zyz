// ============================================================
// 矢量立绘系统：角色/妖物全部改为 Canvas 矢量绘制，
// 启动时以 8 倍超采样烘焙成离屏画布（无外部素材依赖）。
// 对外 API 与旧像素系统完全一致：
//   Pixel.sprites.{swordsman,taoist,monk,mob_*,elite,tree,rock}
//   Pixel.portraits.{swordsman,taoist,monk}
//   Pixel.drawSprite(ctx, spr, x, y, scale, flash, squash)
// 风格：不休战队式的 Q 版质感——渐变上色 + 深色描边 + 高光 + 大眼睛
// ============================================================
const Pixel = {
  sprites: {},
  portraits: {},

  // 超采样烘焙：painter 在 logicalW×logicalH 逻辑坐标里作画，
  // 实际位图放大 RES 倍保证任意缩放平滑；width/height 暴露逻辑尺寸保持旧调用兼容
  bakeArt(logicalW, logicalH, painter) {
    const RES = 8;
    const cv = document.createElement('canvas');
    cv.width = logicalW * RES; cv.height = logicalH * RES;
    const c = cv.getContext('2d');
    c.scale(RES, RES);
    c.lineJoin = 'round'; c.lineCap = 'round';
    painter(c, logicalW, logicalH);
    // 受击闪白用的剪影（先烘焙再覆盖 width/height，保证拿到真实位图尺寸）
    const wt = document.createElement('canvas');
    wt.width = cv.width; wt.height = cv.height;
    const wc = wt.getContext('2d');
    wc.drawImage(cv, 0, 0);
    wc.globalCompositeOperation = 'source-in';
    wc.fillStyle = '#fff'; wc.fillRect(0, 0, wt.width, wt.height);
    cv._white = wt;
    Object.defineProperty(cv, 'width', { value: logicalW });
    Object.defineProperty(cv, 'height', { value: logicalH });
    return cv;
  },

  // 以 (x,y) 为脚底中心绘制；flash>0 叠加白色剪影受击闪烁；
  // squash 纵向压扁时横向微膨胀（等体积呼吸感）
  drawSprite(ctx, spr, x, y, scale = 1, flash = 0, squash = 1) {
    const w = spr.width * scale * (1 + (1 - squash) * 0.6);
    const h = spr.height * scale * squash;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(spr, x - w / 2, y - h, w, h);
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash);
      ctx.drawImage(spr._white, x - w / 2, y - h, w, h);
    }
    ctx.restore();
  },

  init() {
    const OUT = '#2b2740';                       // 角色通用描边色

    // ================= 通用绘制小工具 =================
    function rr(c, x, y, w, h, r) {              // 圆角矩形 path
      r = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
    function lg(c, x1, y1, x2, y2, stops) {      // 线性渐变
      const g = c.createLinearGradient(x1, y1, x2, y2);
      for (const [p, col] of stops) g.addColorStop(p, col);
      return g;
    }
    function rg(c, x, y, r0, r1, stops) {        // 径向渐变
      const g = c.createRadialGradient(x, y, r0, x, y, r1);
      for (const [p, col] of stops) g.addColorStop(p, col);
      return g;
    }
    function shape(c, pathFn, fill, stroke, lw = 1.1) {
      c.beginPath(); pathFn();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
    }
    function capsule(c, x1, y1, x2, y2, w, color, outline) {
      if (outline) {
        c.strokeStyle = outline; c.lineWidth = w + 1.8;
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      }
      c.strokeStyle = color; c.lineWidth = w;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    // 大眼睛：眼白 + 虹膜 + 瞳孔 + 双高光（裁在眼白内）
    function eye(c, x, y, w, h, iris, o = {}) {
      c.beginPath();
      c.ellipse(x, y, w / 2, h / 2, o.tilt || 0, 0, Math.PI * 2);
      c.fillStyle = '#fff'; c.fill();
      c.strokeStyle = '#3a3248'; c.lineWidth = 0.6; c.stroke();
      c.save(); c.clip();
      const iy = y + h * 0.1;
      c.beginPath(); c.ellipse(x, iy, w * 0.36, h * 0.44, 0, 0, Math.PI * 2);
      c.fillStyle = iris; c.fill();
      c.beginPath(); c.ellipse(x, iy + h * 0.04, w * 0.17, h * 0.24, 0, 0, Math.PI * 2);
      c.fillStyle = '#23243c'; c.fill();
      c.beginPath(); c.ellipse(x - w * 0.13, y - h * 0.1, w * 0.14, h * 0.17, 0, 0, Math.PI * 2);
      c.fillStyle = '#fff'; c.fill();
      c.beginPath(); c.ellipse(x + w * 0.12, iy + h * 0.22, w * 0.08, h * 0.1, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
      c.restore();
    }
    // 萌系大眼（克鲁赛德比例）：虹膜占满眼眶、上深下亮、双高光、粗上眼线
    function bigEye(c, x, y, w, h, cTop, cBot) {
      const rx = w / 2, ry = h / 2;
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = '#fff'; c.fill();
      c.strokeStyle = '#3a3248'; c.lineWidth = w > 8 ? 1.5 : 1.1; c.stroke();
      c.save(); c.clip();
      const ig = c.createLinearGradient(0, y - ry, 0, y + ry);
      ig.addColorStop(0, cTop); ig.addColorStop(1, cBot);
      c.beginPath(); c.ellipse(x, y + ry * 0.06, rx * 0.8, ry * 0.88, 0, 0, Math.PI * 2);
      c.fillStyle = ig; c.fill();
      c.beginPath(); c.ellipse(x, y + ry * 0.16, rx * 0.42, ry * 0.52, 0, 0, Math.PI * 2);
      c.fillStyle = '#20223a'; c.fill();
      c.beginPath(); c.ellipse(x - rx * 0.32, y - ry * 0.28, rx * 0.36, ry * 0.3, 0, 0, Math.PI * 2);
      c.fillStyle = '#fff'; c.fill();
      c.beginPath(); c.ellipse(x + rx * 0.3, y + ry * 0.44, rx * 0.22, ry * 0.18, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill();
      c.restore();
      c.strokeStyle = '#3a3248'; c.lineWidth = w > 8 ? 2 : 1.4;   // 粗上眼线
      c.beginPath(); c.ellipse(x, y + ry * 0.06, rx, ry, 0, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
    }
    function blush(c, x, y, w, h, a = 0.35) {
      c.save(); c.globalAlpha = a;
      c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.fillStyle = '#ff8f9e'; c.fill(); c.restore();
    }
    function sparkle(c, x, y, r, color = '#fff', a = 0.85) {
      c.save(); c.globalAlpha = a; c.strokeStyle = color; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - r, y); c.lineTo(x + r, y);
      c.moveTo(x, y - r); c.lineTo(x, y + r);
      c.stroke(); c.restore();
    }

    // ================= 三职业共用身体 / 头部 =================
    // 袍身（肩→散摆）+ 腰带 + 靴；所有职业都是长袍遮腿，只露靴
    function heroBody(c, o) {
      const robe = () => {
        c.beginPath();
        c.moveTo(17.0, 25.2);
        c.bezierCurveTo(15.6, 31, 14.4, 36, 14.2, 41.4);
        c.lineTo(33.8, 41.4);
        c.bezierCurveTo(33.6, 36, 32.4, 31, 31.0, 25.2);
        c.bezierCurveTo(28.5, 23.6, 19.5, 23.6, 17.0, 25.2);
        c.closePath();
      };
      shape(c, robe, lg(c, 0, 24, 0, 42, [[0, o.robe[0]], [1, o.robe[1]]]), o.outline);
      c.save(); robe(); c.clip();                          // 下摆压暗
      c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(10, 37.6, 28, 5);
      c.restore();
      if (o.sash) {
        shape(c, () => rr(c, 13.4, 33.0, 21.2, 3.9, 1.9),
          lg(c, 0, 33, 0, 37, [[0, o.sash[0]], [1, o.sash[1]]]), o.outline, 0.9);
      }
      for (const bx of [17.4, 25.6]) {                     // 靴
        shape(c, () => rr(c, bx, 42.6, 5, 4.2, 1.6), o.boots, o.outline, 1);
      }
    }
    // 头 + 五官；hair 为类专属发型回调（画在头之后、五官之前）
    function heroHead(c, o) {
      shape(c, () => { c.ellipse(24, 14.2, 9.8, 9.9, 0, 0, Math.PI * 2); },
        rg(c, 21, 10, 2, 12, [[0, '#ffe3c1'], [1, '#efb27e']]), o.outline);
      o.hair(c, o.outline);
      if (o.eyes === 'open') {
        eye(c, 19.6, 19.3, 4.7, 5.3, o.iris);
        eye(c, 28.4, 19.3, 4.7, 5.3, o.iris);
      } else if (o.eyes === 'happy') {                     // 眯眯笑 ∩
        c.strokeStyle = '#3a3248'; c.lineWidth = 1.2;
        for (const ex of [19.6, 28.4]) {
          c.beginPath(); c.moveTo(ex - 2.1, 19.9);
          c.quadraticCurveTo(ex, 17.7, ex + 2.1, 19.9); c.stroke();
        }
      } else if (o.eyes === 'slim') {                      // 丹凤眼
        eye(c, 19.4, 19.5, 4.6, 4.1, o.iris, { tilt: 0.14 });
        eye(c, 28.6, 19.5, 4.6, 4.1, o.iris, { tilt: -0.14 });
        c.strokeStyle = '#4a3f5a'; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(17.2, 18.0); c.quadraticCurveTo(19.4, 16.8, 21.6, 18.0); c.stroke();
        c.beginPath(); c.moveTo(26.4, 18.0); c.quadraticCurveTo(28.6, 16.8, 30.8, 18.0); c.stroke();
      }
      blush(c, 16.6, 21.5, 3.2, 2, 0.32);
      blush(c, 31.4, 21.5, 3.2, 2, 0.32);
      if (o.mouth === 'smile') {
        c.strokeStyle = '#8a4a3a'; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(22.6, 22.2);
        c.quadraticCurveTo(24, 23.5, 25.4, 22.2); c.stroke();
      } else if (o.mouth === 'open') {                     // 开口笑
        shape(c, () => {
          c.moveTo(22.3, 22.0);
          c.quadraticCurveTo(24, 24.6, 25.7, 22.0);
          c.closePath();
        }, '#7a4030', '#5c2e22', 0.8);
        c.save(); c.clip();
        c.fillStyle = '#ff9a8a'; c.beginPath(); c.ellipse(24, 24.1, 1.7, 0.9, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }
    // 头顶轮廓冷光（左上方向）——提升"立绘感"的最后一步
    function rimLight(c, cx, cy, r, a0 = Math.PI * 1.05, a1 = Math.PI * 1.75, color = 'rgba(255,255,255,0.4)') {
      c.save(); c.strokeStyle = color; c.lineWidth = 1.6;
      c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke(); c.restore();
    }

    // ================= 剑客（克鲁赛德式：纯平涂 + 粗描边 + 平色大眼） =================
    function paintSwordsman(c) {
      const OL = '#2f2a3c', lw = 1.5;
      // ---- Q版大剑（平涂：底色 + 右半硬边阴影）----
      c.save();
      c.translate(12.8, 36.0); c.rotate(-0.2);
      const blade = () => {
        c.moveTo(-2.2, -2); c.lineTo(-1.9, -19.5);
        c.quadraticCurveTo(-1.7, -21.8, 0, -22.5);
        c.quadraticCurveTo(1.7, -21.8, 1.9, -19.5);
        c.lineTo(2.2, -2);
        c.closePath();
      };
      shape(c, blade, '#d7e0ea', OL, lw);
      c.save(); blade(); c.clip();
      c.fillStyle = '#a9bccf'; c.fillRect(0.4, -23, 3, 22);
      c.restore();
      shape(c, () => rr(c, -5.0, -3.2, 10.0, 3.0, 1.4), '#e3b23c', OL, lw);
      c.restore();
      capsule(c, 12.4, 36.4, 13.8, 40.0, 1.9, '#6b4a32', OL);
      shape(c, () => { c.ellipse(14.0, 40.6, 1.5, 1.4, 0, 0, Math.PI * 2); }, '#e3b23c', OL, 1);
      // 红穗
      c.save(); c.strokeStyle = '#d94a4a'; c.lineWidth = 1.3;
      for (const [dx2, dy] of [[-2.4, 5.2], [0.2, 6.0], [2.2, 5.0]]) {
        c.beginPath(); c.moveTo(13.7, 40.6);
        c.quadraticCurveTo(13.7 + dx2 * 0.4, 40.6 + dy * 0.55, 13.7 + dx2, 40.6 + dy);
        c.stroke();
      }
      c.restore();

      // ---- 小身体（平涂白袍 + 重色腰封）----
      shape(c, () => {
        c.moveTo(16.8, 29.5);
        c.bezierCurveTo(15.6, 34, 14.6, 38, 14.4, 41.5);
        c.lineTo(33.6, 41.5);
        c.bezierCurveTo(33.4, 38, 32.4, 34, 31.2, 29.5);
        c.quadraticCurveTo(24, 27.8, 16.8, 29.5);
        c.closePath();
      }, '#f2f5f8', OL, lw);
      shape(c, () => rr(c, 15.0, 33.6, 18.0, 3.6, 1.6), '#3a4166', OL, lw);   // 腰封（重色）
      shape(c, () => {                                     // 交领（平涂青）
        c.moveTo(18.6, 29.2); c.lineTo(24, 34.2); c.lineTo(29.4, 29.2);
        c.quadraticCurveTo(24, 31.0, 18.6, 29.2);
        c.closePath();
      }, '#3fa7c4', null);
      c.save();
      c.lineWidth = 1.9; c.strokeStyle = '#f2f5f8';
      c.beginPath(); c.moveTo(18.2, 29.1); c.quadraticCurveTo(21, 31.6, 24.6, 34.3); c.stroke();
      c.lineWidth = 1.6; c.strokeStyle = '#3fa7c4';
      c.beginPath(); c.moveTo(29.8, 29.1); c.quadraticCurveTo(27, 31.6, 23.6, 34.2); c.stroke();
      c.restore();

      // ---- 小手小脚 ----
      capsule(c, 31.6, 31.2, 34.2, 35.2, 2.6, '#f2f5f8', OL);
      shape(c, () => { c.ellipse(34.6, 36.2, 2.0, 1.9, 0, 0, Math.PI * 2); }, '#f8c99e', OL, 1.2);
      capsule(c, 16.4, 31.2, 13.9, 35.0, 2.6, '#f2f5f8', OL);
      shape(c, () => { c.ellipse(13.2, 36.0, 2.1, 2.0, 0, 0, Math.PI * 2); }, '#f8c99e', OL, 1.2);
      for (const bx of [17.4, 24.8]) {
        shape(c, () => rr(c, bx, 42.2, 5.8, 4.6, 2), '#3a4166', OL, lw);
      }

      // ---- 大头（平涂肤色，无渐变）----
      shape(c, () => { c.ellipse(24, 18.5, 12.6, 12.4, 0, 0, Math.PI * 2); }, '#f8c99e', OL, lw + 0.1);
      for (const s of [-1, 1]) {                           // 鬓发（平涂深蓝）
        shape(c, () => {
          c.moveTo(24 + s * 11.6, 13.6);
          c.quadraticCurveTo(24 + s * 14.4, 18.5, 24 + s * 11.8, 23.4);
          c.quadraticCurveTo(24 + s * 9.2, 20.5, 24 + s * 9.8, 14.2);
          c.closePath();
        }, '#33395c', OL, lw);
      }
      shape(c, () => {                                     // 刘海锯齿
        c.moveTo(12.6, 11.6);
        c.lineTo(35.4, 11.6);
        c.lineTo(34.4, 15.6); c.lineTo(30.6, 12.9); c.lineTo(27.2, 15.4);
        c.lineTo(24, 12.7); c.lineTo(20.8, 15.4); c.lineTo(17.4, 12.9);
        c.lineTo(13.6, 15.6);
        c.closePath();
      }, '#33395c', OL, lw);
      // ---- CQ式平色大眼：深色眼底 + 方形高光 ----
      for (const ex of [18.7, 29.3]) {
        shape(c, () => rr(c, ex - 3.2, 15.9, 6.4, 8.4, 2.9), '#332e46', OL, 1.3);
        shape(c, () => rr(c, ex - 1.9, 16.9, 2.6, 3.0, 1.2), '#ffffff', null);
        shape(c, () => rr(c, ex + 0.8, 21.6, 1.5, 1.7, 0.7), 'rgba(255,255,255,0.75)', null);
      }
      for (const bx of [13.2, 34.8]) {                     // 腮红（平涂单色）
        shape(c, () => { c.ellipse(bx, 24.8, 2.2, 1.3, 0, 0, Math.PI * 2); }, '#f5a098', null);
      }
      shape(c, () => {                                     // 小嘴
        c.moveTo(22.4, 25.6);
        c.quadraticCurveTo(24, 27.4, 25.6, 25.6);
        c.closePath();
      }, '#8a4038', '#6b2c26', 0.9);

      // ---- 斗笠（平涂 + 笠沿硬边阴影）----
      shape(c, () => {
        c.moveTo(24, 0.8);
        c.quadraticCurveTo(17, 2.4, 10, 9.2);
        c.quadraticCurveTo(24, 12.0, 38, 9.2);
        c.quadraticCurveTo(31, 2.4, 24, 0.8);
        c.closePath();
      }, '#dcb269', OL, lw + 0.1);
      shape(c, () => {
        c.moveTo(10.6, 9.4);
        c.quadraticCurveTo(24, 12.0, 37.4, 9.4);
        c.quadraticCurveTo(24, 10.2, 10.6, 9.4);
        c.closePath();
      }, '#b78d4b', null);
      c.save(); c.strokeStyle = 'rgba(90,69,38,0.5)'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(24, 1.2); c.lineTo(19, 9.8); c.stroke();
      c.beginPath(); c.moveTo(24, 1.2); c.lineTo(29, 9.8); c.stroke();
      c.restore();
      shape(c, () => { c.ellipse(24, 1.0, 1.5, 1.3, 0, 0, Math.PI * 2); }, '#b78d4b', OL, 1);
    }

    // ================= 道士 =================
    function paintTaoist(c) {
      heroBody(c, {
        robe: ['#46539e', '#262f5e'], sash: ['#f2cf6e', '#d9a12e'],
        boots: '#2e3450', outline: OUT,
      });
      // 拂尘（左手）：柄 + 白丝穗
      capsule(c, 13.4, 34.6, 11.2, 25.4, 1.5, '#5a4030', OUT);
      c.save();
      c.strokeStyle = 'rgba(245,248,252,0.92)'; c.lineWidth = 0.9;
      for (const [dx, droop] of [[-2.2, 7.5], [-0.8, 8.6], [0.8, 8.2], [2.2, 7.0]]) {
        c.beginPath(); c.moveTo(11.2, 25.4);
        c.quadraticCurveTo(11.2 + dx, 30, 11.2 + dx * 1.6, 25.4 + droop + 4);
        c.stroke();
      }
      c.restore();
      shape(c, () => { c.ellipse(11.2, 24.9, 1.3, 1.1, 0, 0, Math.PI * 2); }, '#e8b23a', OUT, 0.8); // 穗环
      capsule(c, 30.4, 27.6, 33.2, 33.6, 3.4, '#3a4486', OUT);             // 右臂袖
      shape(c, () => { c.ellipse(33.4, 34.6, 1.7, 1.6, 0, 0, Math.PI * 2); }, '#f2c59e', OUT, 0.9);
      capsule(c, 17.6, 27.6, 14.6, 33.6, 3.4, '#3d4a90', OUT);             // 左臂袖
      shape(c, () => { c.ellipse(14.0, 34.8, 1.8, 1.7, 0, 0, Math.PI * 2); }, '#f4cba2', OUT, 0.9);
      c.save(); c.strokeStyle = 'rgba(232,178,58,0.9)'; c.lineWidth = 1;   // 袍身金绦
      c.beginPath(); c.moveTo(19.4, 25.5); c.lineTo(19.4, 32.6);
      c.moveTo(28.6, 25.5); c.lineTo(28.6, 32.6); c.stroke(); c.restore();

      heroHead(c, {
        outline: OUT, eyes: 'slim', iris: '#b07a2a',
        browColor: '#3a3450', mouth: null,
        hair(c2, OUTLINE) {
          shape(c2, () => {                                  // 道冠发盖：中分 + 美人尖
            c2.moveTo(15.0, 17.2);
            c2.bezierCurveTo(13.8, 8.2, 18.2, 3.6, 24, 3.6);
            c2.bezierCurveTo(29.8, 3.6, 34.2, 8.2, 33.0, 17.2);
            c2.lineTo(28.4, 12.6); c2.lineTo(24, 15.4); c2.lineTo(19.6, 12.6);
            c2.closePath();
          }, lg(c2, 0, 4, 0, 18, [[0, '#3a344e'], [1, '#232032']]), OUTLINE);
          shape(c2, () => { c2.ellipse(24, 3.6, 3.4, 3.1, 0, 0, Math.PI * 2); },   // 发髻
            lg(c2, 0, 0.6, 0, 6.8, [[0, '#4a4266'], [1, '#2a2440']]), OUTLINE, 1);
          capsule(c2, 19.8, 4.2, 28.4, 3.2, 1.3, '#e8b23a', OUTLINE);              // 金簪
          shape(c2, () => { c2.ellipse(28.9, 3.1, 1, 1, 0, 0, Math.PI * 2); }, '#f2cf6e', OUTLINE, 0.7);
          // 八字须
          c2.strokeStyle = '#6b6478'; c2.lineWidth = 1.1;
          c2.beginPath(); c2.moveTo(22.5, 21.6); c2.quadraticCurveTo(21, 22.6, 20.4, 24.2); c2.stroke();
          c2.beginPath(); c2.moveTo(25.5, 21.6); c2.quadraticCurveTo(27, 22.6, 27.6, 24.2); c2.stroke();
          capsule(c2, 24, 23.2, 24, 26.6, 1.5, '#6b6478', OUTLINE);                // 山羊须
        },
      });
      rimLight(c, 24, 14.2, 8.9);
    }

    // ================= 和尚 =================
    function paintMonk(c) {
      heroBody(c, {
        robe: ['#f7ecd8', '#ddc49e'], sash: null,
        boots: '#6b4a2e', outline: OUT,
      });
      shape(c, () => {                                     // 袈裟：左肩斜披到右腰
        c.moveTo(16.4, 25.0);
        c.bezierCurveTo(14.8, 31, 14.2, 36, 14.2, 41.4);
        c.lineTo(24.6, 41.4);
        c.bezierCurveTo(26.5, 36, 29.8, 30.5, 31.2, 26.8);
        c.bezierCurveTo(27.5, 24.4, 19.8, 24.2, 16.4, 25.0);
        c.closePath();
      }, lg(c, 0, 24, 0, 42, [[0, '#f4a94e'], [1, '#c9741f']]), OUT);
      c.save(); c.strokeStyle = '#f2cf6e'; c.lineWidth = 1.1;              // 袈裟金边
      c.beginPath(); c.moveTo(30.6, 27.4); c.bezierCurveTo(28.5, 32, 26.2, 37, 25.4, 40.8); c.stroke();
      c.restore();
      // 念珠（胸前弧线）
      const beads = [[19.2, 27.6], [18.6, 31.0], [19.8, 34.2], [22.2, 36.4], [25.2, 36.6], [27.8, 34.8], [29.4, 31.8]];
      for (const [bx, by] of beads)
        shape(c, () => { c.ellipse(bx, by, 1.25, 1.25, 0, 0, Math.PI * 2); }, '#a04a3a', '#5c241c', 0.7);
      // 合十双手
      capsule(c, 17.8, 34.6, 23.0, 32.2, 3.0, '#f4cba2', OUT);
      capsule(c, 30.2, 34.6, 25.0, 32.2, 3.0, '#f4cba2', OUT);
      shape(c, () => rr(c, 22.4, 29.8, 3.2, 5.6, 1.6), '#f4cba2', OUT, 0.9);
      heroHead(c, {
        outline: OUT, eyes: 'happy', iris: null,
        browColor: '#8a5a3a', mouth: 'open',
        hair(c2, OUTLINE) {                                // 光头：戒疤 + 头顶高光
          c2.save();
          c2.fillStyle = '#dfa075';
          for (const [dx, dy] of [[-3.4, -6.6], [0, -7.6], [3.4, -6.6]]) {
            c2.beginPath(); c2.ellipse(24 + dx, 14.2 + dy, 0.95, 0.85, 0, 0, Math.PI * 2); c2.fill();
          }
          c2.strokeStyle = 'rgba(255,255,255,0.5)'; c2.lineWidth = 1.4;
          c2.beginPath(); c2.arc(24, 14.2, 7.6, Math.PI * 1.15, Math.PI * 1.45); c2.stroke();
          c2.restore();
        },
      });
      rimLight(c, 24, 14.2, 9.1);
    }

    // ================= 妖物四型（24×24） =================
    const MOB_OUT = {
      green: '#175430', red: '#6b1f16', purple: '#3c1e5c', gold: '#8a6a10',
    };
    function blobPath(c, cx = 12, top = 3.5, w = 8.5, bot = 22.5) {  // 圆润妖物身形
      c.beginPath();
      c.moveTo(cx - w, 13.5);
      c.bezierCurveTo(cx - w, top + 3, cx - w * 0.45, top, cx, top);
      c.bezierCurveTo(cx + w * 0.45, top, cx + w, top + 3, cx + w, 13.5);
      c.bezierCurveTo(cx + w, bot - 3, cx + w * 0.55, bot, cx, bot);
      c.bezierCurveTo(cx - w * 0.55, bot, cx - w, bot - 3, cx - w, 13.5);
      c.closePath();
    }
    const paintMob = {
      green(c) {                                           // 妖藤芽
        shape(c, () => blobPath(c), rg(c, 9, 8, 2, 14, [[0, '#8ce8a8'], [0.6, '#3bb26e'], [1, '#1f7a45']]), MOB_OUT.green);
        capsule(c, 12, 4.6, 12, 1.6, 1.2, '#1e8449', MOB_OUT.green);       // 顶茎
        for (const [lx, rot] of [[9.6, -0.55], [14.4, 0.55]])             // 双叶
          shape(c, () => { c.ellipse(lx, 2.2, 2.9, 1.5, rot, 0, Math.PI * 2); },
            lg(c, lx - 3, 1, lx + 3, 3.5, [[0, '#a4f296'], [1, '#4db56a']]), MOB_OUT.green, 0.8);
        eye(c, 9.6, 13.4, 4.2, 4.9, '#2b4a3e');
        eye(c, 14.4, 13.4, 4.2, 4.9, '#2b4a3e');
        blush(c, 7.2, 16.2, 2.6, 1.6); blush(c, 16.8, 16.2, 2.6, 1.6);
        c.strokeStyle = '#1d5c38'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(10.8, 16.8); c.quadraticCurveTo(12, 18, 13.2, 16.8); c.stroke();
        c.save(); blobPath(c); c.clip();                   // 底部压暗
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(2, 18.5, 20, 5); c.restore();
      },
      red(c) {                                             // 火魈
        for (const s of [-1, 1])                           // 双角
          shape(c, () => {
            c.moveTo(12 + s * 5.4, 6.6);
            c.quadraticCurveTo(12 + s * 8.6, 4.4, 12 + s * 9.2, 0.8);
            c.quadraticCurveTo(12 + s * 7.2, 2.6, 12 + s * 4.2, 4.6);
            c.closePath();
          }, lg(c, 12, 0, 12, 7, [[0, '#f6ecd2'], [1, '#d9c39a']]), '#8a6a4a', 0.8);
        shape(c, () => blobPath(c, 12, 3.2, 8.6, 21.8),
          rg(c, 9, 8, 2, 14, [[0, '#ff9a80'], [0.6, '#e05238'], [1, '#a83226']]), MOB_OUT.red);
        eye(c, 9.4, 12.6, 3.9, 4.4, '#8a2a1e');
        eye(c, 14.6, 12.6, 3.9, 4.4, '#8a2a1e');
        c.strokeStyle = '#5c1512'; c.lineWidth = 1.2;      // 怒眉
        c.beginPath(); c.moveTo(7.4, 9.6); c.lineTo(11.0, 11.0); c.stroke();
        c.beginPath(); c.moveTo(16.6, 9.6); c.lineTo(13.0, 11.0); c.stroke();
        shape(c, () => {                                   // 獠牙咧嘴
          c.moveTo(8.6, 16.2);
          c.quadraticCurveTo(12, 19.6, 15.4, 16.2);
          c.quadraticCurveTo(12, 17.6, 8.6, 16.2);
          c.closePath();
        }, '#5c1512', '#40100c', 0.7);
        c.fillStyle = '#fff';                              // 双獠牙
        c.beginPath(); c.moveTo(10.2, 16.6); c.lineTo(10.9, 18.4); c.lineTo(11.5, 16.8); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(12.9, 16.8); c.lineTo(13.5, 18.4); c.lineTo(14.2, 16.6); c.closePath(); c.fill();
      },
      purple(c) {                                          // 影妖（尖帽幽影）
        shape(c, () => {                                   // 钟形罩袍 + 波浪下摆
          c.moveTo(12, 1.2);
          c.bezierCurveTo(6.5, 1.6, 3.4, 8, 3.0, 15.5);
          c.quadraticCurveTo(5.0, 17.8, 7.0, 15.8);
          c.quadraticCurveTo(9.0, 18.2, 11.0, 16.2);
          c.quadraticCurveTo(13.0, 18.4, 15.0, 16.2);
          c.quadraticCurveTo(17.0, 18.2, 19.0, 15.8);
          c.quadraticCurveTo(21.0, 17.8, 21.0, 15.5);
          c.bezierCurveTo(20.6, 8, 17.5, 1.6, 12, 1.2);
          c.closePath();
        }, lg(c, 0, 2, 0, 18, [[0, '#b57ed4'], [1, '#6d3a96']]), MOB_OUT.purple);
        shape(c, () => { c.ellipse(12, 10.2, 5.4, 4.4, 0, 0, Math.PI * 2); }, '#2a1740', null);  // 兜帽阴影
        c.save(); c.shadowColor = '#ffd166'; c.shadowBlur = 2.5;                 // 帽下妖瞳
        c.fillStyle = '#ffd166';
        c.beginPath(); c.ellipse(9.8, 10.2, 1.5, 1.0, -0.3, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(14.2, 10.2, 1.5, 1.0, 0.3, 0, Math.PI * 2); c.fill();
        c.restore();
        c.save(); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.9;
        c.beginPath(); c.arc(12, 11, 8.6, Math.PI * 1.15, Math.PI * 1.55); c.stroke(); c.restore();
      },
      gold(c) {                                            // 金魄
        shape(c, () => blobPath(c, 12, 4.4, 8.4, 22.4),
          rg(c, 9, 9, 2, 14, [[0, '#ffefA0'], [0.6, '#f2c23a'], [1, '#c08a12']]), MOB_OUT.gold);
        shape(c, () => {                                   // 三尖冠
          c.moveTo(7.6, 4.6); c.lineTo(8.4, 0.9); c.lineTo(10.2, 3.4);
          c.lineTo(12, 0.4); c.lineTo(13.8, 3.4); c.lineTo(15.6, 0.9);
          c.lineTo(16.4, 4.6); c.closePath();
        }, lg(c, 0, 0.4, 0, 4.8, [[0, '#ffe066'], [1, '#d9a12e']]), '#9a7410', 0.8);
        shape(c, () => { c.ellipse(12, 4.3, 0.9, 0.9, 0, 0, Math.PI * 2); }, '#e0483a', '#8a2018', 0.6); // 冠珠
        eye(c, 12, 13.0, 6.0, 6.4, '#b07a2a');             // 独目
        blush(c, 6.6, 16.0, 2.4, 1.5); blush(c, 17.4, 16.0, 2.4, 1.5);
        c.strokeStyle = '#8a6a10'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(10.8, 17.6); c.quadraticCurveTo(12, 18.7, 13.2, 17.6); c.stroke();
        sparkle(c, 4.4, 6.2, 1.6); sparkle(c, 19.8, 8.6, 1.3);
        c.save(); blobPath(c, 12, 4.4, 8.4, 22.4); c.clip();
        c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(2, 18.4, 20, 5); c.restore();
      },
    };

    // ================= 妖将 / 妖王（32×32） =================
    function paintElite(c) {
      const OUT2 = '#2a1440';
      for (const s of [-1, 1])                             // 巨角（先画，被身体压住根部）
        shape(c, () => {
          c.moveTo(16 + s * 4.4, 9.0);
          c.bezierCurveTo(16 + s * 9.5, 8.0, 16 + s * 12.5, 5.0, 16 + s * 13.5, 0.6);
          c.bezierCurveTo(16 + s * 10.5, 3.0, 16 + s * 7.5, 5.0, 16 + s * 4.0, 6.4);
          c.closePath();
        }, lg(c, 16, 0, 16, 9, [[0, '#f6ecd2'], [1, '#c9a97a']]), '#7a5a34', 0.9);
      shape(c, () => {                                     // 魁梧身形：宽肩→收腰
        c.moveTo(4.2, 12.5);
        c.bezierCurveTo(4.2, 7.0, 9.5, 3.2, 16, 3.2);
        c.bezierCurveTo(22.5, 3.2, 27.8, 7.0, 27.8, 12.5);
        c.lineTo(26.6, 23.5);
        c.bezierCurveTo(26.6, 28.6, 23.0, 31.0, 16, 31.0);
        c.bezierCurveTo(9.0, 31.0, 5.4, 28.6, 5.4, 23.5);
        c.closePath();
      }, lg(c, 0, 3, 0, 31, [[0, '#9a55c8'], [0.55, '#71389e'], [1, '#4a2270']]), OUT2, 1.1);
      c.save(); c.beginPath();                             // 胸甲压暗 + 金 V 纹
      c.moveTo(4.2, 12.5);
      c.bezierCurveTo(4.2, 7.0, 9.5, 3.2, 16, 3.2);
      c.bezierCurveTo(22.5, 3.2, 27.8, 7.0, 27.8, 12.5);
      c.lineTo(26.6, 23.5);
      c.bezierCurveTo(26.6, 28.6, 23.0, 31.0, 16, 31.0);
      c.bezierCurveTo(9.0, 31.0, 5.4, 28.6, 5.4, 23.5);
      c.closePath(); c.clip();
      c.fillStyle = 'rgba(20,8,40,0.35)'; c.fillRect(4, 3, 24, 9);
      c.strokeStyle = '#e8b23a'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(9.5, 8.5); c.lineTo(16, 15.5); c.lineTo(22.5, 8.5); c.stroke();
      c.restore();
      c.save(); c.shadowColor = '#ffd166'; c.shadowBlur = 2.5;   // 斜吊妖瞳
      c.fillStyle = '#ffd166';
      c.beginPath(); c.ellipse(12.2, 11.4, 2.5, 1.5, -0.35, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(19.8, 11.4, 2.5, 1.5, 0.35, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1e1230';
      c.beginPath(); c.ellipse(12.2, 11.4, 0.8, 1.2, -0.35, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(19.8, 11.4, 0.8, 1.2, 0.35, 0, Math.PI * 2); c.fill();
      c.restore();
      shape(c, () => {                                     // 獠牙嘴
        c.moveTo(11.5, 17.0);
        c.quadraticCurveTo(16, 21.0, 20.5, 17.0);
        c.quadraticCurveTo(16, 18.8, 11.5, 17.0);
        c.closePath();
      }, '#3a1030', '#240a20', 0.8);
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(13.2, 17.6); c.lineTo(13.9, 19.6); c.lineTo(14.6, 17.9); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(17.4, 17.9); c.lineTo(18.1, 19.6); c.lineTo(18.8, 17.6); c.closePath(); c.fill();
      for (const s of [-1, 1]) {                           // 手臂 + 爪
        capsule(c, 16 + s * 10.8, 13.5, 16 + s * 12.6, 21.5, 3.4, '#8244b0', OUT2);
        c.fillStyle = '#e8d8f2';
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(16 + s * (11.4 + i * 1.3), 21.0);
          c.lineTo(16 + s * (11.1 + i * 1.4), 24.0);
          c.lineTo(16 + s * (12.2 + i * 1.2), 21.6);
          c.closePath(); c.fill();
        }
      }
    }

    // ================= 场景装饰 =================
    function paintTree(c) {
      shape(c, () => rr(c, 10.3, 14.5, 3.4, 8, 1.2), lg(c, 10, 14, 14, 23, [[0, '#9a6434'], [1, '#6b4222']]), '#3d2513', 1);
      for (const [tx, ty, tr] of [[12, 8.5, 6.2], [7.2, 12.0, 4.6], [16.8, 12.0, 4.6]])
        shape(c, () => { c.ellipse(tx, ty, tr, tr * 0.92, 0, 0, Math.PI * 2); },
          rg(c, tx - tr * 0.4, ty - tr * 0.4, 1, tr * 1.4, [[0, '#6fdc96'], [1, '#2f9e5c']]), '#1d6b3c', 1);
      c.save(); c.globalAlpha = 0.3; c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(9.6, 7.2, 1.7, 1.2, -0.5, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    function paintRock(c) {
      shape(c, () => {
        c.moveTo(3.8, 20.5); c.lineTo(4.6, 13.0); c.lineTo(9.8, 8.2);
        c.lineTo(16.8, 8.8); c.lineTo(21.0, 14.0); c.lineTo(20.2, 20.5);
        c.closePath();
      }, lg(c, 0, 8, 0, 21, [[0, '#b4bec2'], [1, '#64747a']]), '#38434a', 1);
      c.save(); c.globalAlpha = 0.45; c.fillStyle = '#e2ebee';    // 顶面受光
      c.beginPath(); c.moveTo(6.2, 12.6); c.lineTo(10.2, 9.4); c.lineTo(15.6, 9.8); c.lineTo(12.4, 12.8); c.closePath(); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(40,55,62,0.55)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(10.4, 13.2); c.lineTo(9.2, 17.4); c.stroke();
      c.beginPath(); c.moveTo(15.8, 12.4); c.lineTo(17.4, 16.8); c.stroke();
    }

    // ================= 半身立绘（64×64，选人卡 / 大招特写） =================
    function portraitBase(c, accent) {
      c.fillStyle = '#161b30'; c.fillRect(0, 0, 64, 64);   // 深底
      shape(c, () => { c.ellipse(32, 34, 27, 26, 0, 0, Math.PI * 2); },
        rg(c, 32, 34, 3, 27, [[0, accent + 'cc'], [0.65, accent + '55'], [1, accent + '00']]), null);
      c.save(); c.globalAlpha = 0.07; c.fillStyle = '#fff';// 斜向微光
      c.beginPath(); c.moveTo(-10, 64); c.lineTo(24, -10); c.lineTo(44, -10); c.lineTo(10, 64); c.closePath(); c.fill();
      c.restore();
    }
    // 半身像共用头部（比全身像眼睛更大更亮）
    function portraitHead(c, o) {
      shape(c, () => { c.ellipse(32, 27.5, 15.8, 15.6, 0, 0, Math.PI * 2); },
        rg(c, 26, 20, 3, 20, [[0, '#ffe3c1'], [1, '#efb27e']]), o.outline);
      o.hair(c, o.outline);
      if (o.eyes === 'open') {
        eye(c, 25.0, 31.6, 7.4, 8.4, o.iris);
        eye(c, 39.0, 31.6, 7.4, 8.4, o.iris);
        c.strokeStyle = o.browColor; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(21.2, 26.6); c.quadraticCurveTo(25.0, 24.8, 28.6, 26.4); c.stroke();
        c.beginPath(); c.moveTo(35.4, 26.4); c.quadraticCurveTo(39.0, 24.8, 42.8, 26.6); c.stroke();
      } else if (o.eyes === 'happy') {
        c.strokeStyle = '#3a3248'; c.lineWidth = 1.9;
        for (const ex of [25.0, 39.0]) {
          c.beginPath(); c.moveTo(ex - 3.2, 32.2);
          c.quadraticCurveTo(ex, 28.8, ex + 3.2, 32.2); c.stroke();
        }
        c.strokeStyle = o.browColor; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(21.6, 27.4); c.quadraticCurveTo(25.0, 25.8, 28.4, 27.2); c.stroke();
        c.beginPath(); c.moveTo(35.6, 27.2); c.quadraticCurveTo(39.0, 25.8, 42.4, 27.4); c.stroke();
      } else {                                             // slim 丹凤眼
        eye(c, 24.6, 31.8, 7.2, 6.2, o.iris, { tilt: 0.16 });
        eye(c, 39.4, 31.8, 7.2, 6.2, o.iris, { tilt: -0.16 });
        c.strokeStyle = '#4a3f5a'; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(20.6, 29.4); c.quadraticCurveTo(24.6, 27.2, 28.4, 29.2); c.stroke();
        c.beginPath(); c.moveTo(35.6, 29.2); c.quadraticCurveTo(39.4, 27.2, 43.4, 29.4); c.stroke();
      }
      blush(c, 20.6, 35.8, 5, 3, 0.32); blush(c, 43.4, 35.8, 5, 3, 0.32);
      if (o.mouth === 'smile') {
        c.strokeStyle = '#8a4a3a'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(29.6, 38.6); c.quadraticCurveTo(32, 40.8, 34.4, 38.6); c.stroke();
      } else if (o.mouth === 'open') {
        shape(c, () => {
          c.moveTo(29.2, 38.2);
          c.quadraticCurveTo(32, 42.4, 34.8, 38.2);
          c.closePath();
        }, '#7a4030', '#5c2e22', 1);
        c.save(); c.clip();
        c.fillStyle = '#ff9a8a'; c.beginPath(); c.ellipse(32, 41.6, 2.6, 1.4, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      rimLight(c, 32, 27.5, 14.6, Math.PI * 1.02, Math.PI * 1.72, 'rgba(255,255,255,0.5)');
    }
    function portraitShoulders(c, o) {                     // 肩部衣袍
      shape(c, () => {
        c.moveTo(6, 64);
        c.bezierCurveTo(7, 52, 14, 45.5, 32, 45.5);
        c.bezierCurveTo(50, 45.5, 57, 52, 58, 64);
        c.closePath();
      }, lg(c, 0, 45, 0, 64, [[0, o.robe[0]], [1, o.robe[1]]]), o.outline, 1.2);
      if (o.trim) {
        c.strokeStyle = o.trim; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(26.5, 46.5); c.lineTo(32, 52.5); c.lineTo(37.5, 46.5); c.stroke();
      }
    }

    function paintPortraitSwordsman(c) {
      const OL = '#2f2a3c', lw = 1.6;
      // 平涂底：深底 + 扁平职业色圆环
      c.fillStyle = '#161b30'; c.fillRect(0, 0, 64, 64);
      shape(c, () => { c.ellipse(32, 35, 25, 24, 0, 0, Math.PI * 2); }, '#22335a', null);
      c.save(); c.strokeStyle = 'rgba(63,167,196,0.55)'; c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(32, 35, 25, 24, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
      // 小肩（平涂白袍 + 交领）
      shape(c, () => {
        c.moveTo(11, 64);
        c.bezierCurveTo(13, 55, 21, 50.5, 32, 50.5);
        c.bezierCurveTo(43, 50.5, 51, 55, 53, 64);
        c.closePath();
      }, '#f2f5f8', OL, lw);
      shape(c, () => {
        c.moveTo(24, 50.6); c.lineTo(32, 58.2); c.lineTo(40, 50.6);
        c.quadraticCurveTo(32, 53.4, 24, 50.6);
        c.closePath();
      }, '#3fa7c4', null);
      c.save();
      c.lineWidth = 2.4; c.strokeStyle = '#f2f5f8';
      c.beginPath(); c.moveTo(23.4, 50.5); c.quadraticCurveTo(27.5, 54, 32.8, 58.5); c.stroke();
      c.lineWidth = 2.0; c.strokeStyle = '#3fa7c4';
      c.beginPath(); c.moveTo(40.6, 50.5); c.quadraticCurveTo(36.5, 54, 31.4, 58.3); c.stroke();
      c.restore();
      // 背剑柄（平涂）+ 红穗
      capsule(c, 15, 55.5, 20.5, 48.5, 3.0, '#6b4a32', OL);
      c.save(); c.translate(21.2, 47.2); c.rotate(-0.72);
      shape(c, () => rr(c, -6.2, -1.9, 12.4, 3.8, 1.8), '#e3b23c', OL, 1.4);
      c.restore();
      c.save(); c.strokeStyle = '#d94a4a'; c.lineWidth = 2.0;
      c.beginPath(); c.moveTo(14.6, 56.2); c.quadraticCurveTo(12, 59.5, 14, 62.5); c.stroke();
      c.beginPath(); c.moveTo(15.8, 56.4); c.quadraticCurveTo(15.6, 60, 18.2, 62.4); c.stroke();
      c.restore();

      // 大头（平涂）
      shape(c, () => { c.ellipse(32, 30.5, 18.6, 18.0, 0, 0, Math.PI * 2); }, '#f8c99e', OL, lw + 0.2);
      for (const s of [-1, 1]) {                           // 鬓发
        shape(c, () => {
          c.moveTo(32 + s * 16.8, 21.5);
          c.quadraticCurveTo(32 + s * 20.6, 29.5, 32 + s * 17.0, 36.5);
          c.quadraticCurveTo(32 + s * 13.2, 32.4, 32 + s * 14.0, 22.4);
          c.closePath();
        }, '#33395c', OL, lw);
      }
      shape(c, () => {                                     // 刘海锯齿
        c.moveTo(15.5, 17.5);
        c.lineTo(48.5, 17.5);
        c.lineTo(46.8, 23.2); c.lineTo(41.4, 18.9); c.lineTo(36.4, 23.0);
        c.lineTo(32, 18.6); c.lineTo(27.6, 23.0); c.lineTo(22.6, 18.9);
        c.lineTo(17.2, 23.2);
        c.closePath();
      }, '#33395c', OL, lw);
      // CQ式平色大眼
      for (const ex of [23.8, 40.2]) {
        shape(c, () => rr(c, ex - 4.9, 24.6, 9.8, 12.6, 4.4), '#332e46', OL, 1.6);
        shape(c, () => rr(c, ex - 2.9, 26.2, 3.9, 4.4, 1.8), '#fff', null);
        shape(c, () => rr(c, ex + 1.1, 33.2, 2.2, 2.4, 1.0), 'rgba(255,255,255,0.75)', null);
      }
      for (const bx of [15.6, 48.4]) {                     // 腮红
        shape(c, () => { c.ellipse(bx, 37.5, 3.0, 1.9, 0, 0, Math.PI * 2); }, '#f5a098', null);
      }
      shape(c, () => {                                     // 小嘴
        c.moveTo(29.2, 39.5);
        c.quadraticCurveTo(32, 42.6, 34.8, 39.5);
        c.closePath();
      }, '#8a4038', '#6b2c26', 1.1);
      // 斗笠（平涂 + 硬边阴影）
      shape(c, () => {
        c.moveTo(32, 2.5);
        c.quadraticCurveTo(21.5, 5.0, 11, 15.2);
        c.quadraticCurveTo(32, 19.4, 53, 15.2);
        c.quadraticCurveTo(42.5, 5.0, 32, 2.5);
        c.closePath();
      }, '#dcb269', OL, lw + 0.2);
      shape(c, () => {
        c.moveTo(11.8, 15.4);
        c.quadraticCurveTo(32, 19.4, 52.2, 15.4);
        c.quadraticCurveTo(32, 17.2, 11.8, 15.4);
        c.closePath();
      }, '#b78d4b', null);
      c.save(); c.strokeStyle = 'rgba(90,69,38,0.5)'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(32, 3.2); c.lineTo(25.5, 15.8); c.stroke();
      c.beginPath(); c.moveTo(32, 3.2); c.lineTo(38.5, 15.8); c.stroke();
      c.restore();
      shape(c, () => { c.ellipse(32, 2.8, 2.1, 1.8, 0, 0, Math.PI * 2); }, '#b78d4b', OL, 1.1);
    }
    function paintPortraitTaoist(c) {
      const A = '#e8b23a';
      portraitBase(c, A);
      portraitShoulders(c, { robe: ['#46539e', '#262f5e'], outline: OUT, trim: A });
      portraitHead(c, {
        outline: OUT, eyes: 'slim', iris: '#b07a2a', browColor: '#3a3450', mouth: null,
        hair(c2, OUTLINE) {
          shape(c2, () => {
            c2.moveTo(17.6, 29.0);
            c2.bezierCurveTo(15.8, 15.0, 22.2, 9.2, 32, 9.2);
            c2.bezierCurveTo(41.8, 9.2, 48.2, 15.0, 46.4, 29.0);
            c2.lineTo(40.0, 22.4); c2.lineTo(32, 27.0); c2.lineTo(24.0, 22.4);
            c2.closePath();
          }, lg(c2, 0, 9, 0, 30, [[0, '#3a344e'], [1, '#232032']]), OUTLINE, 1.2);
          shape(c2, () => { c2.ellipse(32, 8.4, 5.4, 4.8, 0, 0, Math.PI * 2); },
            lg(c2, 0, 3.6, 0, 13.2, [[0, '#4a4266'], [1, '#2a2440']]), OUTLINE, 1.1);
          capsule(c2, 24.4, 9.0, 39.8, 7.2, 2, A, OUTLINE);
          shape(c2, () => { c2.ellipse(40.6, 7.0, 1.6, 1.6, 0, 0, Math.PI * 2); }, '#f2cf6e', OUTLINE, 0.9);
          c2.strokeStyle = '#6b6478'; c2.lineWidth = 1.6;
          c2.beginPath(); c2.moveTo(29.4, 35.4); c2.quadraticCurveTo(26.8, 37.2, 25.8, 40.2); c2.stroke();
          c2.beginPath(); c2.moveTo(34.6, 35.4); c2.quadraticCurveTo(37.2, 37.2, 38.2, 40.2); c2.stroke();
          capsule(c2, 32, 37.4, 32, 43.6, 2.2, '#6b6478', OUTLINE);
        },
      });
    }
    function paintPortraitMonk(c) {
      const A = '#e8952f';
      portraitBase(c, A);
      portraitShoulders(c, { robe: ['#f4a94e', '#c9741f'], outline: OUT, trim: '#f2cf6e' });
      // 念珠搭在肩前
      const beads = [[22.5, 47.5], [21.0, 51.5], [21.4, 55.8], [23.6, 59.4], [27.0, 62.0], [30.8, 63.4]];
      for (const [bx, by] of beads)
        shape(c, () => { c.ellipse(bx, by, 2, 2, 0, 0, Math.PI * 2); }, '#a04a3a', '#5c241c', 0.9);
      portraitHead(c, {
        outline: OUT, eyes: 'happy', iris: null, browColor: '#8a5a3a', mouth: 'open',
        hair(c2, OUTLINE) {
          c2.save();
          c2.fillStyle = '#dfa075';
          for (const [dx, dy] of [[-5.6, -10.6], [0, -12.2], [5.6, -10.6]]) {
            c2.beginPath(); c2.ellipse(32 + dx, 27.5 + dy, 1.5, 1.35, 0, 0, Math.PI * 2); c2.fill();
          }
          c2.strokeStyle = 'rgba(255,255,255,0.5)'; c2.lineWidth = 2.2;
          c2.beginPath(); c2.arc(32, 27.5, 12.2, Math.PI * 1.12, Math.PI * 1.45); c2.stroke();
          c2.restore();
        },
      });
    }

    // ================= 烘焙注册 =================
    const HERO = { swordsman: paintSwordsman, taoist: paintTaoist, monk: paintMonk };
    for (const [name, fn] of Object.entries(HERO))
      this.sprites[name] = this.bakeArt(48, 48, fn);
    for (const [name, fn] of Object.entries(paintMob))
      this.sprites['mob_' + name] = this.bakeArt(24, 24, fn);
    this.sprites.elite = this.bakeArt(32, 32, paintElite);
    this.sprites.tree = this.bakeArt(24, 24, paintTree);
    this.sprites.rock = this.bakeArt(24, 24, paintRock);
    this.portraits.swordsman = this.bakeArt(64, 64, paintPortraitSwordsman);
    this.portraits.taoist = this.bakeArt(64, 64, paintPortraitTaoist);
    this.portraits.monk = this.bakeArt(64, 64, paintPortraitMonk);
  },
};
