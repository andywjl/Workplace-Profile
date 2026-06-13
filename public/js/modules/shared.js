// ============================================================
// Demo Modules - Shared UI primitives & registry
// 工单/小邮局/耗材/资产/能耗/AI总结 共用
// ============================================================

// Module registry: tabs render into #bldTabContent, hooks fire on building load
window.BldModules = {
  tabs: {},
  onBuildingLoaded: function (bldId) {
    if (window.renderAttentionCards) renderAttentionCards(bldId);
    if (window.renderAiSummarySection) renderAiSummarySection(bldId);
  }
};

window.ModUI = (function () {
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- 统计卡行 ----
  function statCards(items, cols) {
    cols = cols || 4;
    return '<div class="grid grid-cols-' + cols + ' gap-4 mb-4">' + items.map(function (i) {
      return '<div class="kpi-card"><div class="kpi-value" style="color:' + (i.color || '#1e293b') + '">' + i.value + '</div>' +
        '<div class="kpi-label">' + esc(i.label) + '</div>' +
        '<div class="kpi-sub">' + (i.sub || '') + '</div></div>';
    }).join('') + '</div>';
  }

  // ---- 状态徽章 ----
  var STATUS_TONE = {
    '已完成': 'green', '已取': 'green', '在用': 'green', '正常': 'green', '充足': 'green',
    '处理中': 'blue', '配送中': 'blue', '进行中': 'blue',
    '待处理': 'amber', '待取': 'amber', '维修中': 'amber', '偏低': 'amber',
    '滞留': 'red', '预警': 'red', '超期': 'red', '紧急': 'red',
    '闲置': 'gray', '已关闭': 'gray', '报废': 'gray', '退回': 'gray', '普通': 'gray'
  };
  function statusBadge(s) {
    return '<span class="badge badge-' + (STATUS_TONE[s] || 'gray') + '">' + esc(s) + '</span>';
  }

  // ---- 同比/环比箭头 ----
  function trendBadge(delta, goodWhenDown) {
    if (delta == null) return '<span class="text-slate-300">—</span>';
    var up = delta > 0;
    var good = goodWhenDown ? !up : up;
    var color = delta === 0 ? '#94a3b8' : good ? '#4a7c5f' : '#b05050';
    var arrow = delta === 0 ? '→' : up ? '▲' : '▼';
    return '<span style="color:' + color + ';font-size:0.7rem">' + arrow + ' ' + Math.abs(delta) + '%</span>';
  }

  // ---- 区块标题 ----
  function sectionTitle(title, right) {
    return '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="text-sm font-semibold text-slate-800">' + title + '</h3>' +
      '<span class="text-xs text-slate-400">' + (right || '') + '</span></div>';
  }

  // ---- 带分页的数据表 ----
  var REG = {};
  var seq = 0;
  function dataTable(opts) {
    var id = 'modtbl' + (++seq);
    REG[id] = { columns: opts.columns, rows: opts.rows || [], pageSize: opts.pageSize || 10, page: 1 };
    return '<div id="' + id + '">' + renderPage(id) + '</div>';
  }
  function renderPage(id) {
    var o = REG[id];
    var pages = Math.max(1, Math.ceil(o.rows.length / o.pageSize));
    if (o.page > pages) o.page = pages;
    var rows = o.rows.slice((o.page - 1) * o.pageSize, o.page * o.pageSize);
    var html = '<div class="overflow-x-auto"><table class="data-table"><thead><tr>' +
      o.columns.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    if (rows.length === 0) {
      html += '<tr><td colspan="' + o.columns.length + '" class="text-center text-slate-400 py-8 text-xs">暂无数据</td></tr>';
    }
    rows.forEach(function (r) {
      html += '<tr>' + o.columns.map(function (c) {
        return '<td class="text-xs">' + (c.render ? c.render(r) : esc(r[c.key])) + '</td>';
      }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="flex items-center justify-end gap-1.5 mt-2 text-xs text-slate-400">' +
      '<span class="mr-2">共 ' + o.rows.length + ' 条</span>' +
      '<button onclick="ModUI.page(\'' + id + '\',-1)" class="px-2 py-0.5 rounded border border-slate-200 ' + (o.page <= 1 ? 'opacity-30' : 'hover:bg-slate-50') + '">‹</button>' +
      '<span class="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">' + o.page + '</span><span>/ ' + pages + '</span>' +
      '<button onclick="ModUI.page(\'' + id + '\',1)" class="px-2 py-0.5 rounded border border-slate-200 ' + (o.page >= pages ? 'opacity-30' : 'hover:bg-slate-50') + '">›</button></div>';
    return html;
  }
  function page(id, d) {
    var o = REG[id];
    if (!o) return;
    var pages = Math.max(1, Math.ceil(o.rows.length / o.pageSize));
    o.page = Math.min(pages, Math.max(1, o.page + d));
    var el = document.getElementById(id);
    if (el) el.innerHTML = renderPage(id);
  }

  return { esc: esc, statCards: statCards, statusBadge: statusBadge, trendBadge: trendBadge, sectionTitle: sectionTitle, dataTable: dataTable, page: page };
})();
