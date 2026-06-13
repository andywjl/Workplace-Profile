// ============================================================
// Demo Module - 能耗管理（覆盖原"能效与设备" tab）
// ============================================================
(function () {
  BldModules.tabs.energy = async function (container, bldId) {
    var p = await DemoData.profile(bldId);
    var e = p.energy;
    var over = e.budget_used > 100;

    container.innerHTML =
      ModUI.statCards([
        { value: (e.month_kwh / 10000).toFixed(1) + '万', label: '本月电耗 (kWh)', sub: '单位面积 ' + e.per_sqm + ' kWh/㎡' },
        { value: (e.yoy > 0 ? '+' : '') + e.yoy + '%', label: '同比去年', color: e.yoy > 0 ? '#b05050' : '#4a7c5f', sub: '近 12 个月累计' },
        { value: e.budget_used + '%', label: '预算执行率', color: over ? '#b05050' : e.budget_used > 85 ? '#d97706' : '#4a7c5f', sub: '¥' + e.cost_ytd + '万 / ¥' + e.budget + '万' },
        { value: over ? '超支' : '正常', label: '预算状态', color: over ? '#b05050' : '#4a7c5f', sub: over ? '建议启动节能措施' : '按计划执行中' }
      ]) +
      '<div class="content-card">' +
      ModUI.sectionTitle('⚡ 月度电耗趋势', '近 12 个月 vs 去年同期') +
      '<div id="chartEnergyTrendDemo" style="height:340px"></div>' +
      '</div>' +
      '<div class="mt-4 content-card">' +
      ModUI.sectionTitle('💡 节能建议', '基于近 12 个月数据') +
      '<div class="space-y-2 text-xs text-slate-600">' +
      '<div class="bld-alert-card ' + (over ? 'bld-alert-warn' : 'bld-alert-info') + '">' +
      (over
        ? '<b>预算超支预警：</b>当前执行率 ' + e.budget_used + '%，主要超支集中在夏季制冷月份，建议核查冷机运行策略、推进 EC 风机改造措施。'
        : '<b>运行正常：</b>预算执行率 ' + e.budget_used + '%，夏季高峰前建议提前进行冷机保养，并复核照明分区开关逻辑。') +
      '</div>' +
      '<div class="bld-alert-card bld-alert-info">夏季峰值月（7-8 月）电耗约为全年均值的 1.5 倍，建议错峰预冷 + 末端温度统一设定 26℃。</div>' +
      '</div></div>';

    // 趋势图
    var chart = getOrCreateChart('chartEnergyTrendDemo');
    if (!chart) return;
    chart.setOption({
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e2e8f0', textStyle: { color: '#334155', fontSize: 12 } },
      legend: { data: ['本期电耗', '去年同期'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: 60, right: 20, top: 20, bottom: 50 },
      xAxis: { type: 'category', data: e.months, axisLabel: { fontSize: 10, color: '#94a3b8' }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'kWh', axisLabel: { fontSize: 10, color: '#94a3b8', formatter: function (v) { return (v / 10000).toFixed(0) + '万'; } }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      series: [
        { name: '本期电耗', type: 'bar', data: e.cur, itemStyle: { color: '#6f7bb2', borderRadius: [4, 4, 0, 0] }, barWidth: 14 },
        { name: '去年同期', type: 'line', data: e.prev, smooth: true, lineStyle: { color: '#c7a67a', width: 2, type: 'dashed' }, itemStyle: { color: '#c7a67a' }, symbol: 'circle', symbolSize: 5 }
      ]
    });
  };
})();
