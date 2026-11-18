// ============================================================
// 随机事件系统（文字游戏式）：事件池 / 功法 / 道具
// 事件 = title + text + choices[]，choice.fx(r) 返回结果文字
// 功法 = Run 内被动叠加；道具 = 背包 3 格，可在战斗中使用
// ============================================================
const Events = {
  // ---- 功法 ----
  GONGFA: {
    tuna:    { name: '吐纳诀',   desc: '每进入新房间回复15%气血' },
    chiyang: { name: '赤阳功',   desc: '攻击+25%，每次受伤额外+2' },
    guixi:   { name: '龟息功',   desc: '受到的伤害-25%' },
    yufeng:  { name: '御风步',   desc: '移动速度+30%' },
    jingang: { name: '金刚体',   desc: '气血上限+40' },
    jianxin: { name: '剑心通明', desc: '技能冷却-30%' },
  },
  has(r, id) { return (r.gongfa || []).includes(id); },
  learn(r, id) { if (!this.has(r, id)) r.gongfa.push(id); },

  // 随机悟一门未学功法；全学完则折功德
  randGongfa(r) {
    const missing = Object.keys(this.GONGFA).filter(id => !this.has(r, id));
    if (!missing.length) { r.merit += 50; return '你已尽悟诸法，化为功德 +50。'; }
    const id = U.pick(missing);
    this.learn(r, id);
    return `你悟得【${this.GONGFA[id].name}】—— ${this.GONGFA[id].desc}。`;
  },

  // ---- 道具 ----
  ITEMS: {
    huichun: { name: '回春丹', desc: '回复50%气血' },
    hufu:    { name: '护身符', desc: '致命伤免死并回30%（自动）' },
    yaodan:  { name: '妖丹',   desc: '使用：功德+60' },
    linglu:  { name: '灵露',   desc: '使用：灵力+5' },
  },
  add(r, id) {
    if (r.items.length >= 3) return false;
    r.items.push(id);
    return true;
  },
  randItem(r, text) {                       // 得随机道具；满则折功德
    const id = U.pick(Object.keys(this.ITEMS));
    if (this.add(r, id)) return `${text}得【${this.ITEMS[id].name}】。`;
    r.merit += 30;
    return `${text}行囊已满，折作功德 +30。`;
  },
  use(r, id) {
    const i = r.items.indexOf(id);
    if (i < 0) return null;
    let text = '';
    if (id === 'huichun') {
      const mh = Talents.maxHp(r), heal = Math.round(mh * 0.5);
      r.hp = Math.min(mh, r.hp + heal);
      text = `回春化雾，气血 +${heal}。`;
    } else if (id === 'yaodan') {
      r.merit += 60;
      text = '药力化开，功德 +60。';
    } else if (id === 'linglu') {
      r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + 5);
      text = '灵露入腹，灵力 +5。';
    } else return null;
    r.items.splice(i, 1);
    return text;
  },

  // ---- 事件池 ----
  POOL: [
    {
      id: 'spring', title: '山涧灵泉',
      text: '林间小潭泛着微光，寒气沁人，潭底似有灵砂闪动。',
      choices: [
        { label: '掬水饮下', fx: r => {
          const mh = Talents.maxHp(r), h = Math.round(mh * U.randInt(25, 40) / 100);
          r.hp = Math.min(mh, r.hp + h);
          return `清泉入腹，气血 +${h}。`;
        } },
        { label: '汲水携行', fx: r => {
          if (Events.add(r, 'huichun')) return '你灌满水壶，凝成一枚【回春丹】。';
          r.merit += 30;
          return '水壶已满，你收了潭边灵砂，功德 +30。';
        } },
      ],
    },
    {
      id: 'stele', title: '无名残碑',
      text: '半截石碑立在荒草间，碑文古朴，隐有剑意流转。',
      choices: [
        { label: '参悟碑文', fx: r => Events.randGongfa(r) },
        { label: '拓印卖钱', fx: r => { r.merit += 45; return '拓片卖给了收购的先生，功德 +45。'; } },
      ],
    },
    {
      id: 'elder', title: '云游老道',
      text: '一位老道坐在青石上打盹，葫芦里酒香四溢。',
      choices: [
        { label: '上前听道', fx: r => Events.randGongfa(r) },
        { label: '以功德求丹', fx: r => {
          if (r.merit < 30) return '功德不足，老道笑着摆了摆手。';
          r.merit -= 30;
          Events.add(r, 'huichun');
          Events.add(r, 'linglu');
          return '老道赠你【回春丹】与【灵露】。';
        } },
      ],
    },
    {
      id: 'merchant', title: '行脚妖商',
      text: '戴着斗笠的妖商挑着担子，口中念念有词："买丹咯——"。',
      choices: [
        { label: '花25功德买丹', fx: r => {
          if (r.merit < 25) return '功德不够，妖商把担子挑走了。';
          r.merit -= 25;
          return Events.randItem(r, '一手交钱一手交货，');
        } },
        { label: '掀了它的摊子', fx: r => {
          const mh = Talents.maxHp(r), hurt = Math.round(mh * 0.2);
          r.hp = Math.max(1, r.hp - hurt);
          return Events.randItem(r, '妖物反噬咬了你一口（气血 -' + hurt + '），但') ;
        } },
      ],
    },
    {
      id: 'graves', title: '荒山义冢',
      text: '累累坟茔间纸钱飘舞，似有低声呜咽。',
      choices: [
        { label: '焚香祭拜', fx: r => {
          r.merit += 25;
          const mh = Talents.maxHp(r), h = Math.round(mh * 0.15);
          r.hp = Math.min(mh, r.hp + h);
          return `亡者安息，功德 +25，气血 +${h}。`;
        } },
        { label: '搜寻遗物', fx: r => {
          if (Math.random() < 0.6) return Events.randItem(r, '你从旧棺中翻出一物，');
          r.merit += 10;
          return '只有几枚铜钱，功德 +10。';
        } },
      ],
    },
    {
      id: 'brokensword', title: '崖前断剑',
      text: '半截断剑插在崖边石缝里，剑身刻着"不平"二字。',
      choices: [
        { label: '参悟剑意', fx: r => Events.randGongfa(r) },
        { label: '熔了卖钱', fx: r => { r.merit += 50; return '好钢！铁匠出的价不低，功德 +50。'; } },
      ],
    },
    {
      id: 'bell', title: '林中古钟',
      text: '一口铜钟半埋在藤蔓里，钟声能传出十里。',
      choices: [
        { label: '撞钟三响', fx: r => {
          r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + 3);
          r.merit += 10;
          return '钟声涤荡心神，灵力 +3，功德 +10。';
        } },
        { label: '钟下默祷', fx: r => {
          const mh = Talents.maxHp(r), h = Math.round(mh * 0.2);
          r.hp = Math.min(mh, r.hp + h);
          return `心神安宁，气血 +${h}。`;
        } },
      ],
    },
    {
      id: 'child', title: '迷路孩童',
      text: '一个孩子蹲在岔路口抽泣，说是与家人走散了。',
      choices: [
        { label: '送他回家', fx: r => {
          r.merit += 25;
          Events.add(r, 'huichun');
          return `孩子家人千恩万谢，功德 +25，还赠了枚【回春丹】。`;
        } },
        { label: '径直走过', fx: r => {
          r.merit = Math.max(0, r.merit - 5);
          return '哭声在身后渐渐远去，你心中难安，功德 -5。';
        } },
      ],
    },
    {
      id: 'herb', title: '崖壁药圃',
      text: '崖壁上有人开垦的药圃，大小药株齐齐整整——守园的似乎不在。',
      choices: [
        { label: '只采小株', fx: r => {
          Events.add(r, 'huichun');
          return '你摘了株熟透的，得【回春丹】。';
        } },
        { label: '连大株拔走', fx: r => {
          const mh = Talents.maxHp(r), hurt = Math.round(mh * 0.15);
          r.hp = Math.max(1, r.hp - hurt);
          Events.add(r, 'huichun');
          Events.add(r, 'huichun');
          return `归途中被守园妖鹊啄伤（气血 -${hurt}），但得【回春丹】×2。`;
        } },
      ],
    },
    {
      id: 'cave', title: '妖穴洞口',
      text: '山壁上有个黑黢黢的洞口，隐约透出宝光，也透出腥风。',
      choices: [
        { label: '摸进去', fx: r => {
          r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + 4);
          r.merit += 35;
          const mh = Talents.maxHp(r), hurt = Math.round(mh * 0.1);
          r.hp = Math.max(1, r.hp - hurt);
          return `洞底有妖兽巢穴遗落的宝物：灵力 +4，功德 +35（气血 -${hurt}）。`;
        } },
        { label: '绕开走', fx: r => '腥风太重，你掩鼻绕行。' },
      ],
    },
    {
      id: 'moon', title: '溪中月影',
      text: '夜色下溪水映着圆月，波光如练，四下寂静。',
      choices: [
        { label: '静坐悟道', fx: r => Events.randGongfa(r) },
        { label: '掬水洗伤', fx: r => {
          const mh = Talents.maxHp(r), h = Math.round(mh * 0.25);
          r.hp = Math.min(mh, r.hp + h);
          return `月光似有凉意，气血 +${h}。`;
        } },
      ],
    },
    {
      id: 'altar', title: '荒村香案',
      text: '破败村庄里只剩一座香案，供品竟还新鲜。',
      choices: [
        { label: '上香祈福（20功德）', fx: r => {
          if (r.merit < 20) return '功德不足，香炉冷冷清清。';
          r.merit -= 20;
          r.shenli = Math.min(CONFIG.ROGUE.SHENLI_CAP, r.shenli + 5);
          return '香烟笔直上升，灵力 +5。';
        } },
        { label: '拿走供品', fx: r => {
          r.merit += 40;
          const mh = Talents.maxHp(r), hurt = Math.round(mh * 0.15);
          r.hp = Math.max(1, r.hp - hurt);
          return `供品值些钱，功德 +40——夜里却辗转难眠（气血 -${hurt}）。`;
        } },
      ],
    },
  ],

  random(r) {
    r.seenEvents = r.seenEvents || [];
    const fresh = this.POOL.filter(e => !r.seenEvents.includes(e.id));
    const ev = U.pick(fresh.length ? fresh : this.POOL);
    r.seenEvents.push(ev.id);
    return ev;
  },

  choose(r, ev, idx) {
    return ev.choices[idx].fx(r);
  },
};
