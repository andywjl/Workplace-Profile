// ============================================================
// Demo Modules - 确定性 mock 数据
// 以 building_id 为种子生成，同一楼宇每次打开数据一致；
// 所有模块（需要关注情况/工单/小邮局/耗材/资产/能耗/AI总结）
// 读同一份 profile，保证页面各处数字口径一致。
// ============================================================

window.DemoData = (function () {

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function ri(rng, min, max) { return Math.floor(min + rng() * (max - min + 1)); }
  function pad(n, w) { return String(n).padStart(w || 2, '0'); }

  // 近 N 个月的 'YYYY-MM' 序列（以 2026-06 为当前月）
  var NOW = { y: 2026, m: 6 };
  function monthSeq(n, offsetYears) {
    var out = [];
    var y = NOW.y - (offsetYears || 0), m = NOW.m;
    for (var i = n - 1; i >= 0; i--) {
      var mm = m - i, yy = y;
      while (mm <= 0) { mm += 12; yy -= 1; }
      out.push(yy + '-' + pad(mm));
    }
    return out;
  }
  function recentDate(rng, days) {
    var d = new Date(2026, 5, 13);
    d.setDate(d.getDate() - ri(rng, 0, days));
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  var TICKET_CATS = ['空调问题', '电梯拥堵', '会议室送水', '保洁服务', '照明报修', '网络问题', '门禁问题', '卫生间维修'];
  var TICKET_TITLES = {
    '空调问题': ['工区温度过低请调高', '会议室空调异响', '下午西晒区域过热', '新风量不足闷热'],
    '电梯拥堵': ['早高峰等梯超过10分钟', '3号梯频繁停层', '货梯占用客梯'],
    '会议室送水': ['会议室饮用水未及时补充', '茶水间纸杯缺货', 'VIP会议室送水延迟'],
    '保洁服务': ['工位垃圾未及时清理', '茶水间台面有积水', '地毯污渍清理'],
    '照明报修': ['工位顶灯闪烁', '走廊感应灯失灵', '会议室灯光过暗'],
    '网络问题': ['会议室投屏断连', 'WiFi信号弱', '网口不通'],
    '门禁问题': ['闸机刷卡失灵', '访客码无法开门', '消防通道门禁报警'],
    '卫生间维修': ['感应水龙头失灵', '隔间门锁损坏', '异味处理']
  };
  var FACILITY_POOL = ['冷机服役年限超期', 'AB栋大门玻璃需更换', '电梯到达大修时间', '屋面防水层老化渗漏', '消防泵房设备老化', '停车场道闸故障频发', '幕墙玻璃胶条老化', '配电房电缆需检测'];
  var FEEDBACK_POOL = [
    { text: '会议室温度过冷', cat: '温度' }, { text: '4 层的空气质量不好', cat: '空气' },
    { text: '食堂排队严重', cat: '餐饮' }, { text: '电梯等待时间长', cat: '电梯' },
    { text: '工位照明偏暗', cat: '照明' }, { text: '卫生间异味', cat: '保洁' },
    { text: '停车位紧张', cat: '停车' }, { text: '直饮水机出水慢', cat: '饮水' }
  ];
  var SURNAMES = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
  var CONSUMABLE_ITEMS = [
    { name: 'A4 复印纸', cat: '办公用品', unit: '箱', price: 120 },
    { name: '签字笔', cat: '办公用品', unit: '盒', price: 25 },
    { name: '抽纸', cat: '清洁耗材', unit: '箱', price: 60 },
    { name: '洗手液', cat: '清洁耗材', unit: '瓶', price: 18 },
    { name: '垃圾袋', cat: '清洁耗材', unit: '卷', price: 8 },
    { name: '5号电池', cat: '办公用品', unit: '盒', price: 30 },
    { name: '白板笔', cat: '办公用品', unit: '盒', price: 35 },
    { name: '咖啡豆', cat: '茶水间', unit: 'kg', price: 150 },
    { name: '一次性纸杯', cat: '茶水间', unit: '箱', price: 45 },
    { name: '消毒湿巾', cat: '清洁耗材', unit: '箱', price: 90 },
    { name: '订书钉', cat: '办公用品', unit: '盒', price: 5 },
    { name: '封箱胶带', cat: '办公用品', unit: '卷', price: 6 }
  ];
  var ASSET_POOL = {
    '家具': ['升降办公桌', '人体工学椅', '会议桌', '文件柜', '沙发', '吧台椅'],
    'IT设备': ['显示器', '会议室大屏', '投屏盒子', '视频会议终端', '打印机', '门禁读卡器'],
    '机电设备': ['组合式空调机组', 'EC风机', '水泵', '配电柜', 'UPS电源', '新风机'],
    '安防设备': ['监控摄像头', '闸机', '消防主机', '烟感探测器', '应急照明箱']
  };
  var CARRIERS = ['顺丰', '京东', '圆通', '中通', '韵达', 'EMS'];
  var DOMAINS = ['对客工单', '小邮局', '康体活动', '礼品管理', '办公用品', '穿梭车服务', '员工内部反馈'];

  var cache = {};

  async function profile(bldId) {
    if (cache[bldId]) return cache[bldId];
    var blds = [];
    try { blds = await getBuildings(); } catch (e) { }
    var b = blds.find(function (x) { return x.id == bldId; }) || {};
    var headcount = b.headcount || 2000;
    var area = b.area_sqm || 30000;
    var rng = mulberry32(bldId * 2654435761 % 4294967295);

    // ---- 工单 ----
    var monthBase = Math.round(headcount / 8);                 // 月工单量随人数
    var slaBad = bldId % 7 === 0;                              // 1/7 的楼宇 SLA 劣化（讲故事）
    var catCounts = TICKET_CATS.map(function (c, i) {
      var w = c === '空调问题' ? 2.6 : c === '电梯拥堵' ? 1.8 : 1;  // 6 月空调放量
      return { category: c, count: Math.round(monthBase * w * (0.4 + rng() * 0.5) / 4) };
    }).sort(function (a, b2) { return b2.count - a.count; });
    var rows = [];
    for (var i = 0; i < 45; i++) {
      var cat = pick(rng, TICKET_CATS);
      var st = rng() < 0.68 ? '已完成' : rng() < 0.55 ? '处理中' : rng() < 0.6 ? '待处理' : '已关闭';
      var sat = st === '已完成' ? (rng() < 0.12 ? ri(rng, 1, 2) : ri(rng, 4, 5)) : null;
      rows.push({
        no: 'TK-2606' + pad(100 + i, 3),
        category: cat,
        title: pick(rng, TICKET_TITLES[cat]),
        status: st,
        priority: rng() < 0.12 ? '紧急' : '普通',
        reporter: pick(rng, SURNAMES) + '同学',
        created: recentDate(rng, 30),
        satisfaction: sat
      });
    }
    var tickets = {
      month_total: catCounts.reduce(function (s, c) { return s + c.count; }, 0),
      wow_delta: ri(rng, -8, 18),
      pending: rows.filter(function (r) { return r.status === '待处理'; }).length,
      low_score: rows.filter(function (r) { return r.satisfaction != null && r.satisfaction <= 2; }).length,
      sla_avg: slaBad ? (4 + rng() * 2).toFixed(2) : (1.6 + rng() * 0.8).toFixed(2),
      sla_prev: slaBad ? (3.5 + rng()).toFixed(2) : (1.5 + rng() * 0.8).toFixed(2),
      top3: catCounts.slice(0, 3),
      rows: rows
    };

    // ---- 设施问题 / 员工反馈 ----
    var fStart = ri(rng, 0, FACILITY_POOL.length - 3);
    var facilities = FACILITY_POOL.slice(fStart, fStart + 3);
    var feedback = [];
    var fbStart = ri(rng, 0, FEEDBACK_POOL.length - 3);
    for (var f = 0; f < 3; f++) {
      var fb = FEEDBACK_POOL[(fbStart + f) % FEEDBACK_POOL.length];
      feedback.push({ text: fb.text, count: f === 0 ? ri(rng, 8, 15) + '次' : '', ok: rng() < 0.25 });
    }

    // ---- 小邮局 ----
    var dailyIn = Math.round(headcount * 0.07 * (0.8 + rng() * 0.4));
    var mailRows = [];
    for (var m = 0; m < 28; m++) {
      var mst = rng() < 0.72 ? '已取' : rng() < 0.7 ? '待取' : '滞留';
      mailRows.push({
        no: pick(rng, ['SF', 'JD', 'YT', 'ZT']) + ri(rng, 10000000, 99999999),
        carrier: pick(rng, CARRIERS),
        recipient: pick(rng, SURNAMES) + '*' + pick(rng, ['明', '华', '芳', '强', '丽']),
        locker: pick(rng, ['A', 'B', 'C']) + '-' + pad(ri(rng, 1, 48)),
        status: mst,
        arrived: recentDate(rng, 7)
      });
    }
    var mail = {
      daily_in: dailyIn,
      waiting: mailRows.filter(function (r) { return r.status === '待取'; }).length * 9,
      stranded_rate: (2 + rng() * 6).toFixed(1),
      pick_hours: (4 + rng() * 5).toFixed(1),
      rows: mailRows
    };

    // ---- 耗材 ----
    var consumableRows = CONSUMABLE_ITEMS.map(function (it, idx) {
      var safety = ri(rng, 10, 30);
      var stock = rng() < 0.2 ? ri(rng, 1, Math.max(2, safety - 2)) : ri(rng, safety, safety * 3);
      return {
        name: it.name, cat: it.cat, unit: it.unit,
        stock: stock, safety: safety,
        month_used: ri(rng, 5, 40),
        status: stock < safety ? '预警' : stock < safety * 1.5 ? '偏低' : '充足'
      };
    });
    var consumables = {
      sku: consumableRows.length,
      month_cost: Math.round(headcount * (6 + rng() * 5)),
      warning: consumableRows.filter(function (r) { return r.status === '预警'; }).length,
      rows: consumableRows
    };

    // ---- 资产 ----
    var assetTotal = Math.round(headcount / 5);
    var assetRows = [];
    var cats = Object.keys(ASSET_POOL);
    for (var a = 0; a < 36; a++) {
      var ac = pick(rng, cats);
      var ast = rng() < 0.82 ? '在用' : rng() < 0.5 ? '闲置' : rng() < 0.6 ? '维修中' : '报废';
      var warrantyDays = ri(rng, -200, 700);
      assetRows.push({
        no: 'ZC-' + pad(bldId, 3) + pad(1000 + a, 4),
        name: pick(rng, ASSET_POOL[ac]),
        cat: ac,
        floor: 'F' + ri(rng, 1, Math.max(2, Math.round((b.floors || 12) * 0.9))),
        status: ast,
        price: ri(rng, 8, 300) * 100,
        warranty_days: warrantyDays,
        custodian: pick(rng, SURNAMES) + pick(rng, ['工', '经理', '主管'])
      });
    }
    var assets = {
      total: assetTotal,
      total_value: Math.round(assetTotal * (0.4 + rng() * 0.3) * 10) / 10, // 万元系数
      repairing: assetRows.filter(function (r) { return r.status === '维修中'; }).length,
      warranty_soon: assetRows.filter(function (r) { return r.warranty_days > 0 && r.warranty_days <= 30; }).length,
      idle_rate: (assetRows.filter(function (r) { return r.status === '闲置'; }).length / assetRows.length * 100).toFixed(1),
      rows: assetRows
    };
    assets.total_value = Math.round(assetTotal * 0.55);

    // ---- 能耗（24 个月，夏冬双峰）----
    var months = monthSeq(12);
    var monthsPrev = monthSeq(12, 1);
    function seasonal(idx) { // idx: 0..11 对应 7月..6月
      var m2 = (7 + idx - 1) % 12 + 1;
      var summer = Math.exp(-Math.pow(m2 - 7.5, 2) / 6) * 0.55;
      var winter = Math.exp(-Math.pow((m2 + 6) % 12 - 7, 2) / 8) * 0.3;
      return 1 + summer + winter;
    }
    var baseKwh = area * 7.5 * (0.85 + rng() * 0.3);
    var overBudget = bldId % 5 === 0;                          // 1/5 楼宇超预算
    var curSeries = months.map(function (ym, i) { return Math.round(baseKwh * seasonal(i) * (0.92 + rng() * 0.16)); });
    var prevSeries = monthsPrev.map(function (ym, i) { return Math.round(baseKwh * seasonal(i) * (0.9 + rng() * 0.16) * (overBudget ? 0.93 : 1.04)); });
    var curCost = curSeries.reduce(function (s, v) { return s + v; }, 0) * 0.85 / 10000;  // 万元
    var budget = b.energy_cost_budget ? b.energy_cost_budget / 10000 : Math.round(curCost * (overBudget ? 0.88 : 1.12));
    var yoy = Math.round((curSeries.reduce(function (s, v) { return s + v; }, 0) / prevSeries.reduce(function (s, v) { return s + v; }, 0) - 1) * 1000) / 10;
    var energy = {
      months: months, cur: curSeries, prev: prevSeries,
      month_kwh: curSeries[curSeries.length - 1],
      per_sqm: (curSeries[curSeries.length - 1] / area).toFixed(1),
      yoy: yoy,
      budget_used: Math.round(curCost / budget * 1000) / 10,
      cost_ytd: Math.round(curCost * 10) / 10,
      budget: Math.round(budget * 10) / 10
    };

    var p = {
      building: b, headcount: headcount,
      tickets: tickets, facilities: facilities, feedback: feedback,
      mail: mail, consumables: consumables, assets: assets, energy: energy,
      domains: DOMAINS,
      updated: '2026/6/12 23:59 (GMT+8)'
    };
    cache[bldId] = p;
    return p;
  }

  return { profile: profile, DOMAINS: DOMAINS };
})();
