// ============================================================
// 菜单界面：主菜单 / 选职业 / 参悟 / 结算（数据路由在 Main）
// 视觉：夜山月色共享背景 + 金匾式面板 + Q版矢量立绘
// ============================================================
const MenuUI = {
  // ---- 共享背景：夜空 / 星 / 月 / 远山 / 雾 / 地面 / 萤火虫 ----
  _bg(ctx) {
    const W = CONFIG.LOGICAL_W, H = CONFIG.LOGICAL_H, t = performance.now();
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#10142a'); g.addColorStop(0.55, '#1a2142'); g.addColorStop(1, '#2a3160');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 星（惰性生成一次，闪烁）
    if (!this._stars) this._stars = Array.from({ length: 46 }, () =>
      ({ x: Math.random() * W, y: Math.random() * 300, r: Math.random() * 1.2 + 0.4, tw: Math.random() * 6 }));
    ctx.fillStyle = '#dfe6ff';
    for (const s of this._stars) {
      ctx.globalAlpha = 0.3 + 0.45 * Math.abs(Math.sin(t / 900 + s.tw));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 月亮 + 光晕 + 月面阴影
    g = ctx.createRadialGradient(292, 96, 8, 292, 96, 64);
    g.addColorStop(0, 'rgba(255,240,200,0.5)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(292, 96, 64, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7ecc8'; ctx.beginPath(); ctx.arc(292, 96, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(215,200,168,0.55)';
    ctx.beginPath(); ctx.arc(285, 89, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(299, 103, 3, 0, Math.PI * 2); ctx.fill();
    // 远山两层
    ctx.fillStyle = '#232a52';
    ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(70, 285); ctx.lineTo(150, 395);
    ctx.lineTo(230, 270); ctx.lineTo(310, 390); ctx.lineTo(360, 330);
    ctx.lineTo(360, 430); ctx.lineTo(0, 430); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2c3566';
    ctx.beginPath(); ctx.moveTo(0, 455); ctx.lineTo(90, 350); ctx.lineTo(190, 452);
    ctx.lineTo(280, 365); ctx.lineTo(360, 440);
    ctx.lineTo(360, 472); ctx.lineTo(0, 472); ctx.closePath(); ctx.fill();
    // 雾带
    ctx.fillStyle = 'rgba(140,160,220,0.08)';
    ctx.fillRect(0, 420, W, 14); ctx.fillRect(0, 448, W, 10);
    // 地面
    g = ctx.createLinearGradient(0, 470, 0, H);
    g.addColorStop(0, '#1c2444'); g.addColorStop(1, '#12162c');
    ctx.fillStyle = g; ctx.fillRect(0, 470, W, H - 470);
    // 萤火虫（时间驱动的漂移光点）
    ctx.fillStyle = '#ffe66d';
    for (let i = 0; i < 6; i++) {
      const fx = 40 + i * 55 + Math.sin(t / 1300 + i * 2.1) * 22;
      const fy = 505 + Math.cos(t / 1700 + i * 1.7) * 26 + i * 6;
      ctx.globalAlpha = 0.25 + 0.4 * Math.abs(Math.sin(t / 700 + i));
      ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // 金匾标题（渐变字 + 柔光）
  _title(ctx, text, y, size = 42) {
    const W = CONFIG.LOGICAL_W;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
    ctx.shadowColor = 'rgba(255,214,90,0.55)'; ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(0, y - size, 0, y + 4);
    g.addColorStop(0, '#ffe9a8'); g.addColorStop(0.55, '#ffd166'); g.addColorStop(1, '#d9922e');
    ctx.fillStyle = g;
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  },

  // ---- 主菜单 ----
  drawMenu(ctx) {
    UI.begin();
    const W = CONFIG.LOGICAL_W, d = Save.data, t = performance.now();
    this._bg(ctx);
    this._title(ctx, '斩 妖 行', 112);
    ctx.textAlign = 'center';
    ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#9aa8dd';
    ctx.fillText('肉鸽跑图 · 斩妖除魔 · 缚妖阵对弈', W / 2, 142);

    // 三位立绘立于月下山道（轻微起伏呼吸）
    const ids = ['swordsman', 'taoist', 'monk'];
    ids.forEach((id, i) => {
      const x = 76 + i * 104, bob = Math.sin(t / 650 + i * 1.15) * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, 566, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
      Pixel.drawSprite(ctx, Pixel.sprites[id], x, 564 + bob, 2.55, 0);
    });

    UI.button(ctx, 80, 208, 200, 46, '开始新的一局', { id: 'start', color: '#3d6a54', border: '#7fce9e' });
    UI.button(ctx, 80, 264, 200, 40, `参悟（功德 ${d.merit}）`, { id: 'enlighten', size: 13, color: '#4a4480' });
    UI.button(ctx, 80, 314, 200, 40, '重置存档', { id: 'reset', color: '#6a3a3a', border: '#c88080', size: 12 });
    ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#8a94c4';
    ctx.fillText(`最高层数：${d.bestLayer} / 3`, W / 2, 384);
    ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#6f7590';
    ctx.fillText('移动 WASD/方向键 · 普攻 J · 移动打断挂机', W / 2, 622);
    UI.button(ctx, 250, 592, 100, 36, `音效：${Sfx.enabled ? '开' : '关'}`, { id: 'sfx', size: 11, color: '#2b3050' });
    ctx.textAlign = 'left';
  },

  clickMenu(x, y) {
    const bid = UI.hit(x, y);
    if (!bid) return;
    Sfx.play('click');
    if (bid === 'start') Main.scene = 'class';
    else if (bid === 'enlighten') Main.scene = 'enlighten';
    else if (bid === 'reset') { Save.reset(); Main.scene = 'menu'; }
    else if (bid === 'sfx') {
      Sfx.enabled = !Sfx.enabled;
      Save.data.sfx = Sfx.enabled;
      Save.flush();
    }
  },

  // ---- 选职业 ----
  drawClass(ctx) {
    UI.begin();
    const W = CONFIG.LOGICAL_W;
    this._bg(ctx);
    this._title(ctx, '择一角色 · 踏入妖境', 62, 21);
    ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#9aa8dd';
    ctx.fillText('技能自动施展（CD到即放），大招只在缚妖阵中使用', W / 2, 86);

    const desc = {
      swordsman: ['破风斩：单体高伤', '大招：剑痕斩击', '划线固定3刀，稳'],
      taoist: ['撒火符：范围灼烧', '大招：咏唱灼烧', '灼烧3回合，早放更赚'],
      monk: ['佛法回春：自回血', '大招：同心祈祷', '破锁减刀，判定最严'],
    };
    const ids = ['swordsman', 'taoist', 'monk'];
    const accents = { swordsman: '#3fa7c4', taoist: '#e8b23a', monk: '#e8952f' };
    ids.forEach((id, i) => {
      const x = 14 + i * 114, y = 108, w = 102, h = 330;
      const ac = accents[id];
      UI.button(ctx, x, y, w, h, ' ', { id, size: 1, invisible: true });
      UI.panel(ctx, x, y, w, h, { border: ac + '88', corner: ac });
      ctx.textAlign = 'center';
      // 立绘半身像（圆角裁切 + 职业色描边）
      ctx.save();
      rrPath(ctx, x + 9, y + 12, w - 18, 86, 8); ctx.clip();
      const face = Pixel.portraits[id];
      if (face) ctx.drawImage(face, x + 9, y + 12, w - 18, 86);
      ctx.restore();
      rrPath(ctx, x + 9.5, y + 12.5, w - 19, 85, 8);
      ctx.strokeStyle = ac; ctx.lineWidth = 1.2; ctx.stroke();
      // 职业顶饰条
      ctx.fillStyle = ac; ctx.fillRect(x + 9, y + 4, w - 18, 3);
      ctx.font = 'bold 16px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(CONFIG.CLASSES[id].name, x + w / 2, y + 122);
      ctx.fillStyle = ac + 'aa'; ctx.fillRect(x + w / 2 - 16, y + 128, 32, 2);
      ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#b9c0dd';
      desc[id].forEach((line, j) => ctx.fillText(line, x + w / 2, y + 154 + j * 20, w - 6));
      ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.fillStyle = ac;
      ctx.fillText('点此出战', x + w / 2, y + h - 12);
    });
    ctx.textAlign = 'left';
  },

  clickClass(x, y) {
    const bid = UI.hit(x, y);
    if (bid && CONFIG.CLASSES[bid]) Main.launchRun(bid);
  },

  // ---- 参悟 ----
  drawEnlighten(ctx) {
    UI.begin();
    const W = CONFIG.LOGICAL_W, d = Save.data;
    this._bg(ctx);
    this._title(ctx, '参 悟', 54, 24);
    ctx.textAlign = 'center';
    ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#9aa8dd';
    ctx.fillText(`功德 ${d.merit} —— 参悟后新天赋入池`, W / 2, 78);

    const unlockables = Talents.DATA.filter(t => t.unlock > 0);
    unlockables.forEach((t, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 16 + col * 168, y = 96 + row * 100, w = 160, h = 92;
      const owned = d.unlockedTalents.includes(t.id);
      const afford = d.merit >= t.unlock;
      UI.button(ctx, x, y, w, h, ' ', { id: 'unl' + t.id, enabled: !owned && afford, invisible: true });
      UI.panel(ctx, x, y, w, h, {
        border: owned ? '#3a8a5a88' : afford ? '#7a6a3a' : '#3a3f58',
        corner: owned ? '#66cc88' : afford ? '#d9b45a' : '#555a70',
        color1: '#181c32',
      });
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = owned ? '#2ecc71' : afford ? '#fff' : '#555a70';
      ctx.fillText(t.name, x + 12, y + 26);
      ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#9aa0b5';
      ctx.fillText(t.desc, x + 12, y + 48, w - 24);
      ctx.fillStyle = owned ? '#2ecc71' : '#ffd166';
      ctx.fillText(owned ? '已参悟' : `${t.unlock} 功德`, x + 12, y + 74);
      ctx.textAlign = 'center';
    });

    UI.button(ctx, 120, 560, 120, 40, '返回', { id: 'back', color: '#4a4480' });
    ctx.textAlign = 'left';
  },

  clickEnlighten(x, y) {
    const bid = UI.hit(x, y);
    if (bid === 'back') { Main.scene = 'menu'; return; }
    if (bid && bid.startsWith('unl')) {
      const id = +bid.slice(3);
      const t = Talents.byId(id);
      const d = Save.data;
      if (t && !d.unlockedTalents.includes(id) && d.merit >= t.unlock) {
        d.merit -= t.unlock;
        d.unlockedTalents.push(id);
        Save.flush();
      }
    }
  },

  // ---- 结算 ----
  drawSettle(ctx) {
    UI.begin();
    const S = Main.settle, W = CONFIG.LOGICAL_W;
    ctx.fillStyle = 'rgba(6,8,16,0.82)'; ctx.fillRect(0, 0, W, CONFIG.LOGICAL_H);
    const w = 300, h = 380, x = (W - w) / 2, y = 120;
    UI.panel(ctx, x, y, w, h, { border: S.win ? '#4a9a6a' : '#9a4a5a', corner: S.win ? '#66cc88' : '#ff8a9a' });
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.save();
    ctx.shadowColor = S.win ? 'rgba(46,204,113,0.5)' : 'rgba(255,107,129,0.5)'; ctx.shadowBlur = 12;
    ctx.fillStyle = S.win ? '#2ecc71' : '#ff6b81';
    ctx.fillText(S.win ? '斩 妖 成 功' : '力 尽 身 陨', W / 2, y + 46);
    ctx.restore();
    ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c9cede';
    const lines = [
      S.win ? '妖王授首，功德无量' : `倒在了第 ${S.layer} 层`,
      `本局功德 +${S.merit}（已入账）`,
      `抵达层数：${S.layer} · 局内等级：Lv.${S.lv} · 斩妖：${S.kills}`,
      '',
      '本局心法：',
    ];
    lines.forEach((t, i) => ctx.fillText(t, W / 2, y + 76 + i * 22));
    if (S.talents.length) {
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      S.talents.slice(0, 5).forEach((e, i) => {
        ctx.fillStyle = '#a8b3d8';
        ctx.fillText(`${e.t.name} ×${e.n}`, W / 2 - 60, y + 186 + i * 20);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#6f7590';
        ctx.fillText(e.t.desc, x + 120, y + 186 + i * 20);
        ctx.textAlign = 'center';
      });
    } else {
      ctx.fillStyle = '#6f7590'; ctx.fillText('（无）', W / 2, y + 186);
    }
    // 功法 / 剩余道具
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    if (S.gongfa && S.gongfa.length) {
      ctx.fillStyle = '#c8a2ff';
      ctx.fillText('功法：' + S.gongfa.join('、'), W / 2, y + 298, w - 20);
    }
    if (S.items && S.items.length) {
      ctx.fillStyle = '#ffd166';
      ctx.fillText('行囊余：' + S.items.join('、'), W / 2, y + 316, w - 20);
    }
    UI.button(ctx, x + 80, y + h - 46, w - 160, 36, '返回山门', { id: 'toMenu', color: '#4a4480' });
    ctx.textAlign = 'left';
  },

  clickSettle(x, y) {
    const bid = UI.hit(x, y);
    if (bid === 'toMenu') Main.scene = 'menu';
  },
};
