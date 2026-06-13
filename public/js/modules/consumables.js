// ============================================================
// Demo Module - 耗材管理
// ============================================================
(function () {
  BldModules.tabs.consumables = async function (container, bldId) {
    var p = await DemoData.profile(bldId);
    var c = p.consumables;

    container.innerHTML =
      ModUI.statCards([
        { value: c.sku, label: '在管 SKU', sub: '办公 / 清洁 / 茶水间' },
        { value: '¥' + (c.month_cost / 1000).toFixed(1) + 'k', label: '本月消耗金额', sub: '人均 ¥' + (c.month_cost / p.headcount).toFixed(1) },
        { value: c.warning, label: '库存预警', color: c.warning > 0 ? '#b05050' : '#4a7c5f', sub: '低于安全库存' },
        { value: '93%', label: '领用登记率', sub: '线上领用 / 全部领用' }
      ]) +
      '<div class="content-card">' +
      ModUI.sectionTitle('📦 库存清单', '安全库存以下自动标红') +
      ModUI.dataTable({
        columns: [
          { key: 'name', label: '物料名称' },
          { key: 'cat', label: '分类' },
          {
            key: 'stock', label: '当前库存', render: function (r) {
              var pct = Math.min(100, Math.round(r.stock / (r.safety * 2) * 100));
              var color = r.status === '预警' ? '#b05050' : r.status === '偏低' ? '#d97706' : '#4a7c5f';
              return '<div class="flex items-center gap-2"><div class="w-16 bg-slate-100 rounded-full h-1.5"><div class="h-1.5 rounded-full" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '<span>' + r.stock + ' ' + ModUI.esc(r.unit) + '</span></div>';
            }
          },
          { key: 'safety', label: '安全库存', render: function (r) { return r.safety + ' ' + ModUI.esc(r.unit); } },
          { key: 'month_used', label: '本月消耗', render: function (r) { return r.month_used + ' ' + ModUI.esc(r.unit); } },
          { key: 'status', label: '状态', render: function (r) { return ModUI.statusBadge(r.status); } }
        ],
        rows: c.rows.slice().sort(function (a, b) { return (a.status === '预警' ? 0 : a.status === '偏低' ? 1 : 2) - (b.status === '预警' ? 0 : b.status === '偏低' ? 1 : 2); }),
        pageSize: 12
      }) +
      '</div>';
  };
})();
