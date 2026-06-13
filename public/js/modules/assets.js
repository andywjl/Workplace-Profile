// ============================================================
// Demo Module - 资产管理
// ============================================================
(function () {
  BldModules.tabs.asset = async function (container, bldId) {
    var p = await DemoData.profile(bldId);
    var a = p.assets;

    var warrantyRows = a.rows.filter(function (r) { return r.warranty_days > 0 && r.warranty_days <= 30; });
    var warrantyBanner = warrantyRows.length > 0
      ? '<div class="bld-alert-card bld-alert-warn mb-4"><b>⏰ 保修到期提醒</b> ' +
        warrantyRows.slice(0, 3).map(function (r) { return ModUI.esc(r.name) + '（' + r.warranty_days + ' 天后到期）'; }).join('、') +
        (warrantyRows.length > 3 ? ' 等 ' + warrantyRows.length + ' 项' : '') + '</div>'
      : '';

    container.innerHTML =
      ModUI.statCards([
        { value: a.total, label: '资产总数', sub: '家具 / IT / 机电 / 安防' },
        { value: '¥' + a.total_value + '万', label: '资产原值合计', sub: '账面价值' },
        { value: a.repairing, label: '维修中', color: a.repairing > 0 ? '#d97706' : '#4a7c5f', sub: '闲置率 ' + a.idle_rate + '%' },
        { value: a.warranty_soon, label: '保修即将到期', color: a.warranty_soon > 0 ? '#b05050' : '#4a7c5f', sub: '30 天内' }
      ]) +
      warrantyBanner +
      '<div class="content-card">' +
      ModUI.sectionTitle('🏷️ 资产台账', '抽样展示 · 支持按楼层 / 状态筛选（规划中）') +
      ModUI.dataTable({
        columns: [
          { key: 'no', label: '资产编号', render: function (r) { return '<span class="font-mono text-slate-600">' + r.no + '</span>'; } },
          { key: 'name', label: '名称' },
          { key: 'cat', label: '类别' },
          { key: 'floor', label: '位置' },
          { key: 'price', label: '原值', render: function (r) { return '¥' + r.price.toLocaleString(); } },
          {
            key: 'warranty_days', label: '保修', render: function (r) {
              if (r.warranty_days <= 0) return '<span class="text-slate-300">已过保</span>';
              if (r.warranty_days <= 30) return '<span style="color:#b05050">' + r.warranty_days + ' 天后到期</span>';
              return '<span class="text-slate-500">余 ' + r.warranty_days + ' 天</span>';
            }
          },
          { key: 'custodian', label: '保管人' },
          { key: 'status', label: '状态', render: function (r) { return ModUI.statusBadge(r.status); } }
        ],
        rows: a.rows, pageSize: 10
      }) +
      '</div>';
  };
})();
