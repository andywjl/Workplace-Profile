// ============================================================
// ECharts Chart Configurations
// Morandi color palette
// ============================================================

const MORANDI = {
  indigo:   '#6f7bb2',
  green:    '#91a79a',
  amber:    '#c7a67a',
  rose:     '#c69b9b',
  slate:    '#8d9aa8',
  brown:    '#b7a58f',
  blue:     '#8fa6b8',
  lavender: '#b9b7c9',
  h1:       '#6f7bb2',
  h2:       '#c7a67a',
};

let chartInstances = {};

function disposeCharts() {
  Object.values(chartInstances).forEach(c => c.dispose());
  chartInstances = {};
}

// Auto-resize charts on window resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    Object.values(chartInstances).forEach(c => { try { c.resize(); } catch (e) { /* ignore */ } });
  }, 150);
});

function getOrCreateChart(domId) {
  if (chartInstances[domId]) {
    chartInstances[domId].dispose();
  }
  const dom = document.getElementById(domId);
  if (!dom) return null;
  const chart = echarts.init(dom);
  chartInstances[domId] = chart;
  return chart;
}

// ---- Shared tooltip style ----
function tooltipStyle() {
  return {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: [10, 14],
    textStyle: { color: '#334155', fontSize: 12 }
  };
}

// ---- 18-Dimension horizontal bar chart ----
function renderDimBarChart(domId, dimRates, onClick) {
  const chart = getOrCreateChart(domId);
  if (!chart) return;

  const sorted = [...dimRates].sort((a, b) => (a.completion_rate ?? 0) - (b.completion_rate ?? 0));
  const dimNameToId = {};
  for (const d of dimRates) dimNameToId[d.name] = d.dimension_id;

  chart.setOption({
    tooltip: {
      ...tooltipStyle(),
      formatter: p => {
        const id = dimNameToId[p.name];
        return `${p.name}${id ? ' (' + id + ')' : ''}<br/>完成率: <b>${p.value != null ? p.value + '%' : '无数据'}</b>${onClick ? '<br/><span style="color:#94a3b8;font-size:10px">点击查看未达标楼宇</span>' : ''}`;
      }
    },
    grid: { left: 100, right: 75, top: 10, bottom: 20 },
    xAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { formatter: '{value}%', fontSize: 11, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    yAxis: {
      type: 'category',
      data: sorted.map(d => d.name),
      axisLabel: { fontSize: 11, color: '#64748b' },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [{
      type: 'bar',
      data: sorted.map(d => ({
        value: d.completion_rate,
        itemStyle: {
          color: d.completion_rate != null && d.completion_rate >= 100 ? MORANDI.green : MORANDI.rose,
          borderRadius: [0, 6, 6, 0]
        }
      })),
      barWidth: 18,
      cursor: onClick ? 'pointer' : 'default',
      label: {
        show: true, position: 'right', fontSize: 10, color: '#94a3b8',
        formatter: p => p.value != null ? p.value + '%' : '-'
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#e2e8f0', type: 'dashed' },
        data: [{ xAxis: 100, label: { show: false } }]
      }
    }]
  });

  if (onClick) {
    chart.off('click');
    chart.on('click', (params) => {
      const dimId = dimNameToId[params.name];
      if (dimId) onClick(dimId, params.name);
    });
  }
}

// ---- Self-owned vs Leased grouped bar chart ----
function renderAssetCompareChart(domId, overviewData) {
  const chart = getOrCreateChart(domId);
  if (!chart) return;

  // Build self-owned vs leased dimension rates from building_dim_rates
  const dimMap = {};
  if (overviewData.building_dim_rates && overviewData.building_rates) {
    const bldMap = {};
    for (const b of overviewData.building_rates) {
      bldMap[b.building_id] = b;
    }
    for (const dr of overviewData.building_dim_rates) {
      const b = bldMap[dr.building_id];
      const asset = b ? b.asset_type : '租赁职场';
      if (!dimMap[dr.dim_id]) dimMap[dr.dim_id] = { self: [], leased: [] };
      if (asset === '自持园区') dimMap[dr.dim_id].self.push(dr.rate);
      else dimMap[dr.dim_id].leased.push(dr.rate);
    }
  }

  const dimDefs = overviewData.dimension_rates || [];
  const categories = dimDefs.map(d => d.name);
  const avg = arr => {
    const valid = arr.filter(v => v != null);
    return valid.length ? Math.round(valid.reduce((s,v) => s+v, 0) / valid.length * 100) / 100 : null;
  };

  chart.setOption({
    tooltip: { ...tooltipStyle() },
    legend: { data: ['自持园区', '租赁职场'], bottom: 0, padding: [10, 0, 0, 0], textStyle: { fontSize: 11 } },
    grid: { left: 50, right: 20, top: 10, bottom: 70 },
    xAxis: {
      type: 'category', data: categories,
      axisLabel: { rotate: 45, fontSize: 10, color: '#64748b' }
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { formatter: '{value}%', fontSize: 11, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: [
      {
        name: '自持园区', type: 'bar',
        data: dimDefs.map(d => avg(dimMap[d.dimension_id]?.self || [])),
        itemStyle: { color: MORANDI.indigo, borderRadius: [6, 6, 0, 0] },
        barWidth: 14
      },
      {
        name: '租赁职场', type: 'bar',
        data: dimDefs.map(d => avg(dimMap[d.dimension_id]?.leased || [])),
        itemStyle: { color: MORANDI.amber, borderRadius: [6, 6, 0, 0] },
        barWidth: 14
      }
    ]
  });
}

// ---- Radar chart (H2 2025 vs H1 2026) ----
function renderRadarChart(domId, dimRatesH1, dimRatesH2) {
  const chart = getOrCreateChart(domId);
  if (!chart) return;

  const dims = dimRatesH1 || [];
  const indicator = dims.map(d => ({ name: d.dimension_name, max: 100 }));

  chart.setOption({
    tooltip: { ...tooltipStyle() },
    legend: { data: ['H1 2026', 'H2 2025'], bottom: 0, textStyle: { fontSize: 11 } },
    radar: {
      center: ['50%', '50%'],
      radius: '65%',
      indicator,
      axisName: { fontSize: 10, color: '#64748b' }
    },
    series: [{
      type: 'radar',
      data: [
        {
          name: 'H1 2026',
          value: dims.map(d => d.completion_rate ?? 0),
          lineStyle: { color: MORANDI.h1, width: 1.5 },
          areaStyle: { color: 'rgba(111,123,178,0.1)' },
          itemStyle: { color: MORANDI.h1 },
          symbol: 'circle', symbolSize: 4
        },
        {
          name: 'H2 2025',
          value: dimRatesH2 ? dimRatesH2.map(d => d.completion_rate ?? 0) : [],
          lineStyle: { color: MORANDI.h2, width: 1.5, type: 'dashed' },
          areaStyle: { color: 'rgba(199,166,122,0.1)' },
          itemStyle: { color: MORANDI.h2 },
          symbol: 'diamond', symbolSize: 4
        }
      ]
    }]
  });
}

// ---- Dimension × Region heatmap ----
function renderDimRegionHeatmap(domId, overviewData, onClick) {
  const chart = getOrCreateChart(domId);
  if (!chart) return;

  const { building_rates, building_dim_rates, dimension_rates } = overviewData;
  if (!building_rates || !building_dim_rates) return;

  const bldRegion = {};
  for (const b of building_rates) bldRegion[b.building_id] = b.region;

  const regions = ['京区', '北区', '东区', '西区', '南区'];
  const dims = dimension_rates || [];

  // Index dims by id for O(1) lookup
  const dimIndex = {};
  dims.forEach((d, i) => { dimIndex[d.dimension_id] = i; });

  // Pre-populate all region×dim cells, then aggregate
  const agg = {};
  const counts = {};
  for (let ri = 0; ri < regions.length; ri++) {
    for (let di = 0; di < dims.length; di++) {
      agg[`${ri}_${di}`] = 0;
      counts[`${ri}_${di}`] = 0;
    }
  }
  for (const dr of building_dim_rates) {
    const region = bldRegion[dr.building_id];
    if (!region) continue;
    const ri = regions.indexOf(region);
    const di = dimIndex[dr.dim_id];
    if (ri < 0 || di == null || dr.rate == null) continue;
    const key = `${ri}_${di}`;
    agg[key] = (agg[key] || 0) + dr.rate;
    counts[key] = (counts[key] || 0) + 1;
  }

  const data = [];
  for (const key of Object.keys(agg)) {
    const [ri, di] = key.split('_').map(Number);
    const cnt = counts[key];
    if (cnt > 0) {
      const avg = Math.round(agg[key] / cnt * 10) / 10;
      data.push([ri, di, avg]);
    } else {
      data.push({ value: [ri, di, -1], itemStyle: { color: '#e2e8f0' } });
    }
  }

  if (data.length === 0) return;

  const vals = data.map(d => Array.isArray(d) ? d[2] : d.value[2]).filter(v => v >= 0);
  if (vals.length === 0) return;
  let maxVal = Math.max(...vals);
  let minVal = Math.min(...vals);
  // Ensure a visible color range even when all values are similar
  if (maxVal - minVal < 5) {
    const mid = (maxVal + minVal) / 2;
    maxVal = Math.min(100, mid + 10);
    minVal = Math.max(0, mid - 10);
  }

  chart.setOption({
    tooltip: {
      ...tooltipStyle(),
      formatter: p => {
        const ri = p.value[0], di = p.value[1], v = p.value[2];
        const region = regions[ri];
        const dim = dims[di];
        return `${region} · ${dim ? dim.name : ''}${dim ? ' (' + dim.dimension_id + ')' : ''}<br/>达标率: <b>${v >= 0 ? v + '%' : '无数据'}</b>${onClick ? '<br/><span style="color:#94a3b8;font-size:10px">点击下钻到区域</span>' : ''}`;
      }
    },
    grid: { left: 120, right: 80, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: regions,
      position: 'top',
      axisLabel: { fontSize: 12, fontWeight: 600, color: '#475569' },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'category',
      data: dims.map(d => d.name),
      axisLabel: { fontSize: 10, color: '#64748b' },
      axisLine: { show: false },
      axisTick: { show: false },
      inverse: true
    },
    visualMap: {
      min: minVal,
      max: maxVal,
      calculable: true,
      orient: 'vertical',
      right: 10,
      top: 'center',
      itemHeight: 200,
      inRange: { color: ['#b05050', '#e8c8c0', '#f5f0e8', '#c8d8c8', '#4a7c5f'] },
      text: ['高', '低'],
      textStyle: { color: '#94a3b8', fontSize: 10 }
    },
    series: [{
      type: 'heatmap',
      data,
      label: {
        show: true,
        fontSize: 10,
        fontWeight: 600,
        formatter: p => p.value[2] >= 0 ? Math.round(p.value[2]) + '%' : '--'
      },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } },
      itemStyle: { borderRadius: [6, 6, 6, 6] }
    }]
  });

  if (onClick) {
    chart.off('click');
    chart.on('click', (params) => {
      if (params.value && params.value.length >= 2) {
        const region = regions[params.value[0]];
        const dim = dims[params.value[1]];
        if (region && dim) onClick(region, dim.dimension_id, dim.name);
      }
    });
  }
}

// ---- Key-4 Dimensions Dashboard (D15-D18) ----
function renderKey4Dashboard(containerId, chartDomId, overviewData, onClick) {
  const KEY4 = [
    { id: 'D15', name: '环境安全', color: '#6f7bb2' },
    { id: 'D16', name: '温度适宜', color: '#91a79a' },
    { id: 'D17', name: '照明亮堂', color: '#c7a67a' },
    { id: 'D18', name: '空气清新', color: '#8fa6b8' },
  ];

  const { building_rates, building_dim_rates } = overviewData;
  if (!building_rates || !building_dim_rates) return;

  // Map building_id → region
  const bldRegion = {};
  for (const b of building_rates) bldRegion[b.building_id] = b.region;

  // Aggregate: dim_id → { all: [], regions: {} }
  const dimAgg = {};
  for (const k of KEY4) {
    dimAgg[k.id] = { all: [], regions: {} };
  }
  for (const dr of building_dim_rates) {
    if (!dimAgg[dr.dim_id]) continue;
    if (dr.rate == null) continue;
    dimAgg[dr.dim_id].all.push(dr.rate);
    const region = bldRegion[dr.building_id] || '未知';
    if (!dimAgg[dr.dim_id].regions[region]) dimAgg[dr.dim_id].regions[region] = [];
    dimAgg[dr.dim_id].regions[region].push(dr.rate);
  }

  const avg = arr => {
    if (!arr || arr.length === 0) return null;
    return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10;
  };

  // ---- Render KPI Cards (clickable) ----
  const cardsContainer = document.getElementById(containerId);
  if (cardsContainer) {
    cardsContainer.innerHTML = KEY4.map(k => {
      const v = avg(dimAgg[k.id].all);
      const rateColor = v != null ? (v >= 80 ? '#4a7c5f' : v >= 50 ? '#9a7541' : '#b05050') : '#94a3b8';
      const onClickAttr = onClick ? `onclick="window.drillKey4Dim('${k.id}','${k.name}')"` : '';
      return `<div class="kpi-card key4-clickable" ${onClickAttr} style="cursor:${onClick?'pointer':'default'}">
        <div class="kpi-value" style="color:${rateColor}">${v != null ? v + '%' : '--'}</div>
        <div class="kpi-label">${k.name}</div>
        <div class="kpi-sub" style="color:#94a3b8">全国 ${building_rates.length} 个职场 <span style="font-size:0.6rem;color:#cbd5e1">点击查看 ›</span></div>
      </div>`;
    }).join('');
  }

  // ---- Render Region Comparison Chart ----
  const chart = getOrCreateChart(chartDomId);
  if (!chart) return;

  const regions = ['京区', '北区', '东区', '西区', '南区'];

  // Build series name → dim id mapping for click handler
  const nameToDimId = {};
  KEY4.forEach(k => { nameToDimId[k.name] = k.id; });

  chart.setOption({
    tooltip: {
      ...tooltipStyle(),
      formatter: p => `${p.seriesName}${onClick ? ' <span style="color:#94a3b8;font-size:10px">点击查看详情</span>' : ''}<br/>${p.name}: <b>${p.value != null ? p.value + '%' : '--'}</b>`
    },
    legend: {
      data: KEY4.map(k => k.name),
      bottom: 0,
      textStyle: { fontSize: 11 }
    },
    grid: { left: 50, right: 20, top: 10, bottom: 65 },
    xAxis: {
      type: 'category', data: regions,
      axisLabel: { fontSize: 12, fontWeight: 600, color: '#475569' },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { formatter: '{value}%', fontSize: 11, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: KEY4.map(k => ({
      name: k.name,
      type: 'bar',
      data: regions.map(r => avg(dimAgg[k.id].regions[r] || [])),
      itemStyle: { color: k.color, borderRadius: [6, 6, 0, 0] },
      barWidth: 14,
      cursor: onClick ? 'pointer' : 'default'
    }))
  });

  if (onClick) {
    chart.off('click');
    chart.on('click', (params) => {
      const dimId = nameToDimId[params.seriesName];
      if (dimId) onClick(dimId, params.seriesName);
    });
  }
}

// ---- Trend Comparison: H1 2026 vs H2 2025 diverging bar ----
function renderTrendCompareChart(domId, dimRates, prevDimRates, summaryElId, onClick) {
  const chart = getOrCreateChart(domId);
  if (!chart) return;

  const prevMap = {};
  for (const d of (prevDimRates || [])) prevMap[d.dimension_id] = d.completion_rate;

  const data = (dimRates || []).map(d => ({
    name: d.name,
    dimId: d.dimension_id,
    current: d.completion_rate,
    prev: prevMap[d.dimension_id] ?? null,
    delta: d.completion_rate != null && prevMap[d.dimension_id] != null
      ? Math.round((d.completion_rate - prevMap[d.dimension_id]) * 10) / 10
      : null
  })).sort((a, b) => (a.delta ?? -999) - (b.delta ?? -999));

  // Summary
  const improved = data.filter(d => d.delta > 0).length;
  const declined = data.filter(d => d.delta < 0).length;
  const stable = data.filter(d => d.delta === 0).length;
  const noData = data.filter(d => d.delta == null).length;
  if (summaryElId) {
    const el = document.getElementById(summaryElId);
    if (el) {
      const parts = [];
      if (improved > 0) parts.push(`<span style="color:#4a7c5f">▲ ${improved} 项提升</span>`);
      if (declined > 0) parts.push(`<span style="color:#b05050">▼ ${declined} 项下降</span>`);
      if (stable > 0) parts.push(`<span style="color:#94a3b8">→ ${stable} 项持平</span>`);
      if (noData > 0) parts.push(`<span style="color:#cbd5e1">${noData} 项无数据</span>`);
      el.innerHTML = parts.join(' &nbsp;');
    }
  }

  const maxAbsDelta = Math.max(1, ...data.map(d => Math.abs(d.delta ?? 0)));

  chart.setOption({
    tooltip: {
      ...tooltipStyle(),
      formatter: p => {
        const d = data[p.dataIndex];
        const clickHint = onClick ? '<br/><span style="color:#94a3b8;font-size:10px">点击查看楼宇明细</span>' : '';
        return `${d.name}${d.dimId ? ' (' + d.dimId + ')' : ''}<br/>H1 2026: <b>${d.current != null ? d.current + '%' : '--'}</b><br/>H2 2025: <b>${d.prev != null ? d.prev + '%' : '--'}</b><br/>变化: <b style="color:${(d.delta??0) > 0 ? '#4a7c5f' : (d.delta??0) < 0 ? '#b05050' : '#94a3b8'}">${d.delta != null ? (d.delta > 0 ? '+' : '') + d.delta + '%' : '--'}</b>${clickHint}`
      }
    },
    grid: { left: 120, right: 60, top: 10, bottom: 20 },
    xAxis: {
      type: 'value',
      min: -Math.ceil(maxAbsDelta / 5) * 5 - 5,
      max: Math.ceil(maxAbsDelta / 5) * 5 + 5,
      axisLabel: { formatter: v => (v > 0 ? '+' : '') + v + '%', fontSize: 11, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: { fontSize: 10, color: '#64748b' },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        type: 'bar',
        data: data.map(d => ({
          value: d.delta ?? 0,
          itemStyle: {
            color: (d.delta ?? 0) >= 0 ? (d.delta > 0 ? '#4a7c5f' : '#94a3b8') : '#b05050',
            borderRadius: d.delta >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6]
          }
        })),
        barWidth: 18,
        cursor: onClick ? 'pointer' : 'default',
        label: {
          show: true,
          position: 'right',
          fontSize: 10,
          color: '#94a3b8',
          formatter: p => {
            const d = data[p.dataIndex];
            if (d.delta == null) return '--';
            return (d.delta > 0 ? '+' : '') + d.delta + '%';
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#e2e8f0', type: 'solid', width: 1 },
          data: [{ xAxis: 0 }]
        }
      }
    ]
  });

  if (onClick) {
    chart.off('click');
    chart.on('click', (params) => {
      const d = data[params.dataIndex];
      if (d && d.dimId) onClick(d.dimId, d.name);
    });
  }
}
