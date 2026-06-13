// ============================================================
// Demo Module - AI 总结（按服务场景切换 + 可编辑，编辑存 localStorage）
// ============================================================
(function () {
  var current = { bldId: null, domain: '对客工单' };

  function storageKey(bldId, domain) { return 'aiSummary_' + bldId + '_' + domain; }

  // 用 profile 的真实统计数生成各场景模板文案（与页面其他区块口径一致）
  function generate(p, domain) {
    var t = p.tickets, m = p.mail, c = p.consumables;
    var map = {
      '对客工单': {
        exp: ['主要集中在三个方面：其中关于空调温度的反馈环比增加 ' + Math.abs(t.wow_delta) + '%，且 85% 的工单都反应工区环境闷热，造成员工的体感不适',
          '电梯问题也尤为突出，本周收到 ' + t.top3[1].count + ' 条反馈，且有多次反馈电梯等候时间超 10 分钟，可以进一步在早晚高峰期加强人流疏导'],
        ops: ['员工满意度：有 ' + t.low_score + ' 单低分工单，主要问题是空调温度相关，' + Math.max(1, Math.round(t.low_score / 2)) + ' 单提及整体处理流程较慢',
          'SLA 情况：平均响应时长 ' + t.sla_avg + ' 分钟（上期 ' + t.sla_prev + ' 分钟）' + (parseFloat(t.sla_avg) > 3 ? '，已超出 3 分钟目标线，需重点关注' : '，保持在目标范围内')]
      },
      '小邮局': {
        exp: ['日均到件 ' + m.daily_in + ' 件，平均取件时长 ' + m.pick_hours + ' 小时，整体取件体验平稳',
          '滞留率 ' + m.stranded_rate + '%' + (parseFloat(m.stranded_rate) > 5 ? '，高于 5% 目标线，建议增加滞留提醒推送频次' : '，低于 5% 目标线')],
        ops: ['高峰时段集中在 12:00-13:30，建议错峰取件引导', '快递柜利用率约 ' + (60 + p.building.id % 30) + '%，暂无扩容需求']
      },
      '康体活动': {
        exp: ['本月开展瑜伽、羽毛球、健身训练营等活动 ' + (4 + p.building.id % 4) + ' 场，整体报名率约 ' + (75 + p.building.id % 20) + '%',
          '健身房晚高峰（18:00-20:00）器械排队情况偶有发生'],
        ops: ['活动满意度 4.' + (3 + p.building.id % 6) + ' 分，建议增加工间拉伸类轻量活动频次']
      },
      '礼品管理': {
        exp: ['节日礼品发放完成率 100%，无积压', '员工对周年礼品的纪念性反馈较好'],
        ops: ['库存周转正常，下季度礼品采购建议提前 4 周启动比价流程']
      },
      '办公用品': {
        exp: ['本月耗材消耗 ¥' + (c.month_cost / 1000).toFixed(1) + 'k，人均 ¥' + (c.month_cost / p.headcount).toFixed(1) + '，与上月基本持平'],
        ops: [c.warning > 0 ? '有 ' + c.warning + ' 个 SKU 低于安全库存（详见耗材模块），已触发补货流程' : '全部 SKU 库存充足', '线上领用登记率 93%，建议持续推进无人值守领用']
      },
      '穿梭车服务': {
        exp: ['班车准点率 ' + (92 + p.building.id % 7) + '%，早高峰满载率约 ' + (80 + p.building.id % 15) + '%',
          '有员工反馈晚班车末班时间偏早，建议结合加班数据评估延后 30 分钟'],
        ops: ['单均运营成本环比下降 ' + (1 + p.building.id % 4) + '%']
      },
      '员工内部反馈': {
        exp: ['本期收集内部反馈 ' + (20 + p.building.id % 30) + ' 条，TOP 主题：' + p.feedback.map(function (f) { return f.text; }).join('、'),
          '其中 ' + p.feedback.filter(function (f) { return !f.ok; }).length + ' 项未达标，均已关联改进措施跟进'],
        ops: ['反馈响应及时率 ' + (88 + p.building.id % 10) + '%，处理闭环平均 ' + (3 + p.building.id % 4) + ' 天']
      }
    };
    return map[domain] || map['对客工单'];
  }

  function overallSummary(p) {
    var t = p.tickets;
    return '其中关于空调温度的反馈环比增加 ' + Math.abs(t.wow_delta) + '%，且 85% 的工单都反应工区环境闷热，造成员工的体感不适；另外关于员工反馈上存在一些低分反馈，电梯问题也尤为突出，本周收到 ' +
      t.top3[1].count + ' 条反馈，且有多次反馈电梯等候时间超 10 分钟，可以进一步在早晚高峰期加强人流疏导。';
  }

  window.renderAiSummarySection = async function (bldId) {
    var el = document.getElementById('aiSummarySection');
    if (!el) return;
    current.bldId = bldId;
    var p = await DemoData.profile(bldId);
    var esc = ModUI.esc;

    var saved = localStorage.getItem(storageKey(bldId, '_overall'));
    var summaryText = saved || overallSummary(p);

    var domainBtns = p.domains.map(function (d) {
      var active = d === current.domain;
      return '<button onclick="aiSwitchDomain(\'' + d + '\')" class="block w-full text-left px-3 py-2 rounded-lg text-xs transition ' +
        (active ? 'bg-blue-50 text-blue-600 font-medium' : 'text-slate-500 hover:bg-slate-50') + '">' + esc(d) + '</button>';
    }).join('');

    var detail = generate(p, current.domain);
    var savedDetail = localStorage.getItem(storageKey(bldId, current.domain));

    el.innerHTML =
      '<div class="content-card">' +
      '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="text-sm font-semibold text-slate-800">✨ AI 总结</h3>' +
      '<button onclick="aiEditSummary()" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 transition">✏️ 编辑</button></div>' +
      '<div id="aiOverallWrap" class="rounded-xl p-4 mb-4" style="background:linear-gradient(135deg,#eff6ff,#f5f3ff);border:1px solid #dbeafe">' +
      '<div class="text-xs font-semibold text-blue-600 mb-1.5">✦ AI 总结' + (saved ? ' <span class="text-slate-400 font-normal">(已人工编辑)</span>' : '') + '</div>' +
      '<p id="aiOverallText" class="text-xs leading-relaxed text-slate-600">' + esc(summaryText) + '</p></div>' +
      '<div class="flex gap-4">' +
      '<div class="w-32 flex-shrink-0 space-y-0.5 border-r border-slate-100 pr-3">' + domainBtns + '</div>' +
      '<div class="flex-1" id="aiDomainDetail">' + renderDetail(current.domain, detail, savedDetail) + '</div>' +
      '</div></div>';
  };

  function renderDetail(domain, detail, savedText) {
    var esc = ModUI.esc;
    if (savedText) {
      return '<div class="text-xs font-semibold text-slate-700 mb-2">' + esc(domain) + ' <span class="text-slate-400 font-normal">(已人工编辑)</span></div>' +
        '<p class="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">' + esc(savedText) + '</p>';
    }
    return '<div class="flex items-center justify-between mb-2">' +
      '<div class="text-xs font-semibold text-slate-700">' + esc(domain) + '</div>' +
      '<span class="text-xs text-slate-400">2026/01/01 - 至今</span></div>' +
      '<div class="text-xs font-medium text-slate-500 mb-1.5">员工体验情况：</div>' +
      '<ul class="space-y-1 mb-3">' + detail.exp.map(function (s) { return '<li class="text-xs text-slate-600 leading-relaxed pl-3 relative"><span class="absolute left-0 text-slate-300">•</span>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      '<div class="text-xs font-medium text-slate-500 mb-1.5">经营管理情况：</div>' +
      '<ul class="space-y-1">' + detail.ops.map(function (s) { return '<li class="text-xs text-slate-600 leading-relaxed pl-3 relative"><span class="absolute left-0 text-slate-300">•</span>' + esc(s) + '</li>'; }).join('') + '</ul>';
  }

  window.aiSwitchDomain = function (domain) {
    current.domain = domain;
    renderAiSummarySection(current.bldId);
  };

  window.aiEditSummary = function () {
    var wrap = document.getElementById('aiOverallWrap');
    var textEl = document.getElementById('aiOverallText');
    if (!wrap || !textEl) return;
    var cur = textEl.textContent;
    wrap.innerHTML =
      '<div class="text-xs font-semibold text-blue-600 mb-1.5">✦ AI 总结（编辑中）</div>' +
      '<textarea id="aiEditArea" class="w-full rounded-lg border border-blue-200 p-2.5 text-xs text-slate-600 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100" rows="4">' + ModUI.esc(cur) + '</textarea>' +
      '<div class="flex justify-end gap-2 mt-2">' +
      '<button onclick="renderAiSummarySection(' + current.bldId + ')" class="rounded-lg px-3 py-1 text-xs text-slate-400 hover:bg-slate-50">取消</button>' +
      '<button onclick="aiSaveSummary()" class="rounded-lg bg-blue-500 hover:bg-blue-600 px-3 py-1 text-xs text-white">保存</button></div>';
  };

  window.aiSaveSummary = function () {
    var area = document.getElementById('aiEditArea');
    if (!area) return;
    localStorage.setItem(storageKey(current.bldId, '_overall'), area.value.trim());
    if (window.showToast) showToast('AI 总结已保存', 'success');
    renderAiSummarySection(current.bldId);
  };
})();
