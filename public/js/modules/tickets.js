// ============================================================
// Demo Module - 工单 + 需要关注情况
// ============================================================

// ---- 需要关注情况（楼宇页顶部三卡，对齐设计图）----
window.renderAttentionCards = async function (bldId) {
  var el = document.getElementById('bldAttentionCards');
  if (!el) return;
  var p = await DemoData.profile(bldId);
  var esc = ModUI.esc;

  var ticketCard = p.tickets.top3.map(function (t) {
    return '<div class="flex items-center justify-between py-1.5"><span class="text-xs text-slate-600">' + esc(t.category) + '</span>' +
      '<span class="text-xs font-semibold text-slate-700">' + t.count + '单</span></div>';
  }).join('');

  var facilityCard = p.facilities.map(function (f) {
    return '<div class="py-1.5 text-xs text-slate-600">' + esc(f) + '</div>';
  }).join('');

  var feedbackCard = p.feedback.map(function (f) {
    var dot = f.ok ? '#4a7c5f' : '#d97706';
    var label = f.count || (f.ok ? '达标' : '不达标');
    return '<div class="flex items-center justify-between py-1.5"><span class="text-xs text-slate-600">' + esc(f.text) + '</span>' +
      '<span class="flex items-center gap-1 text-xs text-slate-500"><span style="width:6px;height:6px;border-radius:50%;background:' + dot + ';display:inline-block"></span>' + esc(label) + '</span></div>';
  }).join('');

  function card(title, body) {
    return '<div class="content-card"><div class="text-xs font-semibold text-slate-700 mb-1.5 pb-1.5 border-b border-slate-100">' + title + '</div>' + body + '</div>';
  }

  el.innerHTML =
    '<div class="flex items-center justify-between mb-3 mt-1">' +
    '<h3 class="text-sm font-semibold text-slate-800">需要关注情况</h3>' +
    '<span class="text-xs text-slate-400">更新时间 ' + p.updated + '</span></div>' +
    '<div class="grid grid-cols-3 gap-4">' +
    card('工单问题 Top 3', ticketCard) +
    card('设施问题 Top 3', facilityCard) +
    card('员工反馈 Top 3', feedbackCard) +
    '</div>';
};

// ---- 工单 Tab ----
(function () {
  var FILTERS = ['全部', '待处理', '处理中', '已完成'];

  function ticketColumns() {
    return [
      { key: 'no', label: '工单号', render: function (r) { return '<span class="text-blue-500 font-medium">' + r.no + '</span>'; } },
      { key: 'category', label: '分类' },
      { key: 'title', label: '内容' },
      { key: 'priority', label: '优先级', render: function (r) { return r.priority === '紧急' ? ModUI.statusBadge('紧急') : '<span class="text-slate-400">普通</span>'; } },
      { key: 'reporter', label: '提单人' },
      { key: 'created', label: '提单时间' },
      {
        key: 'satisfaction', label: '满意度', render: function (r) {
          if (r.satisfaction == null) return '<span class="text-slate-300">—</span>';
          var color = r.satisfaction <= 2 ? '#b05050' : '#4a7c5f';
          return '<span style="color:' + color + '">' + '★'.repeat(r.satisfaction) + '</span>';
        }
      },
      { key: 'status', label: '状态', render: function (r) { return ModUI.statusBadge(r.status); } }
    ];
  }

  window.renderTicketsTab = async function (container, bldId, filter) {
    filter = filter || '全部';
    var p = await DemoData.profile(bldId);
    var t = p.tickets;
    var slaDelta = Math.round((parseFloat(t.sla_avg) - parseFloat(t.sla_prev)) * 100) / 100;

    var rows = filter === '全部' ? t.rows : t.rows.filter(function (r) { return r.status === filter; });

    var filterBtns = FILTERS.map(function (f) {
      var active = f === filter;
      return '<button onclick="renderTicketsTab(document.getElementById(\'bldTabContent\'),' + bldId + ',\'' + f + '\')" class="px-3 py-1 rounded-lg text-xs transition ' +
        (active ? 'bg-blue-500 text-white font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100') + '">' + f + '</button>';
    }).join('');

    container.innerHTML =
      ModUI.statCards([
        { value: t.month_total, label: '本月工单总数', sub: '环比 ' + ModUI.trendBadge(t.wow_delta, true) },
        { value: t.pending, label: '待处理', color: t.pending > 3 ? '#d97706' : '#1e293b', sub: '近 30 天' },
        { value: t.low_score, label: '低分工单', color: t.low_score > 2 ? '#b05050' : '#4a7c5f', sub: '满意度 ≤ 2 星' },
        { value: t.sla_avg + '分', label: '平均响应时长', color: parseFloat(t.sla_avg) > 3 ? '#b05050' : '#1e293b', sub: '上期 ' + t.sla_prev + ' 分 ' + ModUI.trendBadge(slaDelta === 0 ? 0 : Math.round(slaDelta / parseFloat(t.sla_prev) * 100), true) }
      ]) +
      '<div class="content-card">' +
      '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="text-sm font-semibold text-slate-800">🎫 工单列表</h3>' +
      '<div class="flex items-center gap-1.5">' + filterBtns + '</div></div>' +
      ModUI.dataTable({ columns: ticketColumns(), rows: rows, pageSize: 10 }) +
      '</div>' +
      '<div class="mt-4 content-card">' +
      ModUI.sectionTitle('📊 分类分布', '本月') +
      '<div class="space-y-2">' + p.tickets.top3.concat([]).map(function (c) {
        var max = p.tickets.top3[0].count || 1;
        return '<div class="flex items-center gap-3"><span class="text-xs text-slate-500 w-20">' + ModUI.esc(c.category) + '</span>' +
          '<div class="flex-1 bg-slate-100 rounded-full h-2"><div class="h-2 rounded-full" style="width:' + Math.round(c.count / max * 100) + '%;background:#6f7bb2"></div></div>' +
          '<span class="text-xs text-slate-600 w-12 text-right">' + c.count + '单</span></div>';
      }).join('') + '</div></div>';
  };

  BldModules.tabs.tickets = function (container, bldId) { renderTicketsTab(container, bldId, '全部'); };
})();
