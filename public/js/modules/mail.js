// ============================================================
// Demo Module - 小邮局
// ============================================================
(function () {
  BldModules.tabs.mail = async function (container, bldId) {
    var p = await DemoData.profile(bldId);
    var m = p.mail;

    container.innerHTML =
      ModUI.statCards([
        { value: m.daily_in, label: '日均到件量', sub: '近 7 天' },
        { value: m.waiting, label: '当前待取件', color: '#d97706', sub: '超 3 天自动提醒' },
        { value: m.stranded_rate + '%', label: '滞留率', color: parseFloat(m.stranded_rate) > 5 ? '#b05050' : '#4a7c5f', sub: '滞留 = 到件超 3 天未取' },
        { value: m.pick_hours + 'h', label: '平均取件时长', sub: '到件 → 取件' }
      ]) +
      '<div class="content-card">' +
      ModUI.sectionTitle('📮 近期包裹', '近 7 天 · 实时同步快递柜') +
      ModUI.dataTable({
        columns: [
          { key: 'no', label: '运单号', render: function (r) { return '<span class="font-mono text-slate-600">' + r.no + '</span>'; } },
          { key: 'carrier', label: '承运商' },
          { key: 'recipient', label: '收件人' },
          { key: 'locker', label: '柜号' },
          { key: 'arrived', label: '到件时间' },
          { key: 'status', label: '状态', render: function (r) { return ModUI.statusBadge(r.status); } }
        ],
        rows: m.rows, pageSize: 10
      }) +
      '</div>';
  };
})();
