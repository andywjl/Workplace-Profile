// ============================================================
// Workplace Profile System - Main Application
// ============================================================

// ---- State ----
const state = {
  currentView: 'overview',
  currentGeo: 'china',
  selectedRegion: null,
  selectedBuildingId: null,
  currentPeriod: 'H1_2026',
  prevPeriod: 'H2_2025',
  selectedDimId: null,
  buildingIndicatorsData: null,
  dirtyValues: {},
  dimNameMap: {}, // dimension_id → name
  overviewMeasures: [],
  measureFilter: { status: '', dim: '', phase: '' },
  allBuildingRates: [],
  buildingSearchQuery: '',
  buildingSortCol: 'overall_rate',
  buildingSortDir: 'asc',
  regionBuildingData: [],
  regionBuildingSortCol: 'overall_rate',
  regionBuildingSortDir: 'asc',
  buildingMeasuresAll: [],
  buildingMeasureFilter: { dim: '', phase: '' },
  radarData: null,
  overviewData: null,
};

// ---- DOM refs ----
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---- Helpers ----
function dimIdToName(dimId) {
  if (!dimId) return '-';
  return dimId.split(',').map(id => state.dimNameMap[id.trim()] || id.trim()).join(', ');
}

function parseTargetNum(targetStr) {
  if (!targetStr || targetStr === '—') return null;
  const cleaned = targetStr.replace(/^[≤≥<>]\s*/, '').replace(/:.*$/, '').replace(/%$/, '').replace(/[^0-9.]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || cleaned === '' ? null : n;
}

function calcPreviewRate(actualVal, targetStr, targetType) {
  if (actualVal == null || isNaN(actualVal)) return null;
  const target = parseTargetNum(targetStr);
  if (target == null || target === 0) return null;
  if (targetType === 'upper') return Math.min(100, Math.round(target / actualVal * 100));
  if (targetType === 'lower') return Math.min(100, Math.round(actualVal / target * 100));
  if (targetType === 'fixed') return actualVal === target ? 100 : 0;
  if (targetType === 'trend') return Math.min(100, Math.round(50 + (actualVal / target) * 50));
  return null;
}

function showLoading(container) {
  hideLoading(container);
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(overlay);
}

function hideLoading(container) {
  const overlay = container.querySelector('.loading-overlay');
  if (overlay) overlay.remove();
}

// ---- Initialization ----
async function init() {
  const landingPage = document.getElementById('landingPage');
  const loadingScreen = document.getElementById('loadingScreen');
  const loadingHint = document.getElementById('loadingHint');
  const loginModal = document.getElementById('loginModal');

  const updateHint = (msg) => { if (loadingHint) loadingHint.textContent = msg; };

  // ---- Shared: transition from landing → loading → app ----
  const startApp = async (account) => {
    // Fade out landing
    if (landingPage) {
      landingPage.style.opacity = '0';
      setTimeout(() => { landingPage.style.display = 'none'; }, 600);
    }

    // Show loading
    if (loadingScreen) {
      loadingScreen.style.display = 'flex';
      loadingScreen.style.opacity = '1';
    }

    if (account) state.account = account;

    setupGeoNav();
    setupViewNav();
    setupFilters();
    setupModals();

    updateHint('正在加载维度数据...');
    try {
      const dims = await getDimensions();
      dims.forEach(d => { state.dimNameMap[d.id] = d.name; });
    } catch (e) {
      console.error('Failed to preload dimensions:', e);
    }

    updateHint('正在加载全国总览...');
    await loadOverview();

    // Fade out loading
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  };

  // ---- "直接进入" button ----
  const btnEnter = document.getElementById('btnEnterSystem');
  if (btnEnter) {
    btnEnter.addEventListener('click', () => startApp(null));
  }

  // ---- Login modal ----
  const btnShowLogin = document.getElementById('btnShowLogin');
  const btnCloseLogin = document.getElementById('btnCloseLogin');
  const btnLogin = document.getElementById('btnLogin');
  const loginAccount = document.getElementById('loginAccount');
  const loginPassword = document.getElementById('loginPassword');

  if (btnShowLogin && loginModal) {
    btnShowLogin.addEventListener('click', () => {
      loginModal.style.display = 'flex';
    });
  }
  if (btnCloseLogin && loginModal) {
    btnCloseLogin.addEventListener('click', () => {
      loginModal.style.display = 'none';
    });
  }
  // Click backdrop to close
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) loginModal.style.display = 'none';
    });
  }

  const doLogin = async () => {
    const account = (loginAccount?.value || '').trim();
    const password = (loginPassword?.value || '').trim();
    if (!account) {
      if (loginAccount) { loginAccount.style.borderColor = '#b05050'; loginAccount.focus(); }
      return;
    }
    if (!password) {
      if (loginPassword) { loginPassword.style.borderColor = '#b05050'; loginPassword.focus(); }
      return;
    }
    try {
      const res = await apiPost('/api/login', { account, password });
      if (res.ok) {
        if (loginModal) loginModal.style.display = 'none';
        startApp(account);
      } else {
        showToast(res.error || '登录失败', 'error');
      }
    } catch (err) {
      showToast('登录验证失败，请检查网络', 'error');
    }
  };

  if (btnLogin) btnLogin.addEventListener('click', doLogin);
  if (loginPassword) loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (loginAccount) {
    loginAccount.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    loginAccount.addEventListener('input', () => { loginAccount.style.borderColor = ''; });
  }

  // ---- Back to landing page ----
  const btnBack = document.getElementById('btnBackToLanding');
  if (btnBack && landingPage) {
    btnBack.addEventListener('click', () => {
      disposeCharts();
      // Show landing, hide main content
      landingPage.style.display = '';
      landingPage.style.opacity = '1';
      if (loadingScreen) loadingScreen.style.display = 'none';
      // Clear any loaded data
      clearCache();
      state.overviewData = null;
      state.buildingIndicatorsData = null;
    });
  }
}

// ---- Geo Navigation (China / Non-China) ----
function setupGeoNav() {
  $$('.geo-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.geo-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentGeo = btn.dataset.geo;

      $('#chinaPage').classList.toggle('hidden', state.currentGeo !== 'china');
      $('#nonChinaPage').classList.toggle('hidden', state.currentGeo === 'china');
    });
  });
}

// ---- View Navigation (3-layer) ----
function setupViewNav() {
  $$('.ops-drill-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  state.currentView = view;
  $$('.ops-drill-tab').forEach(b => b.classList.toggle('tab-active', b.dataset.view === view));

  $('#viewOverview').classList.toggle('hidden', view !== 'overview');
  $('#viewRegion').classList.toggle('hidden', view !== 'region');
  $('#viewBuilding').classList.toggle('hidden', view !== 'building');

  updateBreadcrumb();
  disposeCharts();

  // Scroll to top of content
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (view === 'overview') loadOverview();
  else if (view === 'region') loadRegionView();
  if (view === 'building') {
    if (!state.selectedBuildingId) state.selectedBuildingId = 8; // default: 大钟寺广场
    loadBuildingView(state.selectedBuildingId);
  }
}

function updateBreadcrumb() {
  const crumbs = $$('.crumb');
  const sep1 = $('.crumb-sep');
  const sep2 = $('.crumb-sep-2');
  const crumb2 = $('.crumb-2');

  crumbs.forEach(c => c.classList.remove('font-medium', 'text-slate-700'));
  sep1.classList.add('hidden');
  sep2.classList.add('hidden');
  crumb2.classList.add('hidden');

  if (state.currentView === 'overview') {
    crumbs[0].classList.add('font-medium', 'text-slate-700');
  } else if (state.currentView === 'region') {
    crumbs[1].classList.remove('hidden');
    crumbs[1].classList.add('font-medium', 'text-slate-700');
    sep1.classList.remove('hidden');
  } else if (state.currentView === 'building') {
    crumbs[1].classList.remove('hidden');
    crumb2.classList.remove('hidden');
    crumb2.classList.add('font-medium', 'text-slate-700');
    sep1.classList.remove('hidden');
    sep2.classList.remove('hidden');
  }
}

// Click breadcrumb to navigate back
document.getElementById('breadcrumb').addEventListener('click', (e) => {
  const crumb = e.target.closest('.crumb');
  if (!crumb) return;
  const view = crumb.dataset.view;
  if (view) switchView(view);
});

// ---- Filters ----
function setupFilters() {
  $('#filterRegion').addEventListener('change', () => {
    if (state.currentView === 'overview') loadOverview();
    else if (state.currentView === 'region') loadRegionView();
  });
  $('#filterAsset').addEventListener('change', () => {
    if (state.currentView === 'overview') loadOverview();
    else if (state.currentView === 'region') loadRegionView();
  });
  $('#filterPeriod').addEventListener('change', () => {
    state.currentPeriod = $('#filterPeriod').value;
    state.prevPeriod = 'H2_2025';
    // Sync building view period switcher
    const ps = $('#indicatorPeriodSwitcher');
    if (ps) ps.value = state.currentPeriod;
    if (state.currentView === 'overview') loadOverview();
    else if (state.currentView === 'region') loadRegionView();
    else if (state.currentView === 'building' && state.selectedBuildingId) reloadIndicatorsForCurrentPeriod();
  });
}

function setupModals() {
  const modal = $('#dimDrillModal');
  if (!modal) return;

  $('#btnCloseDrillModal').addEventListener('click', () => closeDimDrillDown());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDimDrillDown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeDimDrillDown();
    }
  });
}

function getFilterParams() {
  return {
    region: $('#filterRegion').value,
    asset_type: $('#filterAsset').value,
    period: state.currentPeriod,
    prev_period: state.prevPeriod
  };
}

// ============================================================
// VIEW 1: 全国总览
// ============================================================
async function loadOverview() {
  const panel = $('#viewOverview');
  showLoading(panel);
  try {
    state._measuresLoaded = false;
    state._buildingTableRendered = false;
    const data = await fetchOverview(getFilterParams());
    state.overviewData = data;
    renderKpiCards(data, 'kpiCards');
    renderKey4Dashboard('key4KpiCards', 'chartKey4Region', data, showDimDrillDown);
    renderTrendCompareChart('chartTrendCompare', data.dimension_rates, data.prev_dimension_rates, 'trendSummary', showDimDrillDown);
    renderDimRegionHeatmap('chartDimRegionHeatmap', data, (region, dimId, dimName) => {
      $('#filterRegion').value = region;
      switchView('region');
    });
    renderDimBarChart('chartDimBar', data.dimension_rates, (dimId, dimName) => showDimDrillDown(dimId, dimName));
    renderAssetCompareChart('chartAssetCompare', data);
    renderRegionSummary(data.building_rates || []);
    renderBuildingTable(data.building_rates || []);
    renderMeasuresTable(data.measure_stats || []);
    $('#dataInfo').textContent = `数据填报率: ${data.fill_rate}% | ${data.filled_values}/${data.total_possible}`;
  } catch (err) {
    console.error('loadOverview failed:', err);
    showToast('加载全国总览数据失败', 'error');
  } finally {
    hideLoading(panel);
  }
}

// ---- KPI Cards ----
function renderKpiCards(data, containerId) {
  const container = $('#' + containerId);

  // Compute trend display for overall rate
  let trendSub = 'vs ' + data.prev_period;
  let trendColor = 'slate';
  if (data.prev_overall_rate != null && data.overall_rate != null) {
    const delta = Math.round((data.overall_rate - data.prev_overall_rate) * 10) / 10;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    trendSub = `vs ${data.prev_period}  ${arrow} ${Math.abs(delta).toFixed(1)}%`;
    trendColor = delta > 0 ? 'green' : delta < 0 ? 'rose' : 'slate';
  }

  const cards = [
    { label: '职场总数', value: data.total_buildings, sub: `自持园区 ${data.self_built} / 租赁职场 ${data.leased}`, color: 'slate' },
    { label: '综合达标率', value: data.overall_rate != null ? data.overall_rate + '%' : '--', sub: trendSub, subColor: `color:${trendColor === 'green' ? '#4a7c5f' : trendColor === 'rose' ? '#b05050' : '#94a3b8'}`, color: data.overall_rate != null && data.overall_rate >= 100 ? 'green' : 'rose' },
    { label: '改进措施数', value: (data.measure_stats || []).reduce((s, m) => s + m.cnt, 0), sub: '', color: 'indigo' },
    { label: '数据填报率', value: data.fill_rate + '%', sub: `${data.filled_values} / ${data.total_possible}`, color: 'amber' },
    { label: '未达标楼宇', value: data.not_passing_count, sub: data.total_buildings > 0 ? `占比 ${Math.round(data.not_passing_count / data.total_buildings * 100)}%` : '', color: data.not_passing_count > 0 ? 'rose' : 'green' },
  ];

  container.innerHTML = cards.map(c => {
    const subColor = c.subColor || '';
    return `
    <div class="kpi-card">
      <div class="kpi-value" style="color:${c.color === 'green' ? '#4a7c5f' : c.color === 'rose' ? '#b05050' : c.color === 'indigo' ? '#41558b' : c.color === 'amber' ? '#9a7541' : '#475569'}">${c.value}</div>
      <div class="kpi-label">${c.label}</div>
      ${c.sub ? `<div class="kpi-sub" style="${subColor}">${c.sub}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- Region Summary Cards ----
function renderRegionSummary(buildingRates) {
  const container = $('#regionSummaryCards');
  if (!container) return;

  const regions = ['京区', '北区', '东区', '西区', '南区'];
  const regionData = regions.map(r => {
    const blds = (buildingRates || []).filter(b => b.region === r);
    const rates = blds.map(b => b.overall_rate).filter(v => v != null);
    const prevRates = blds.map(b => b.prev_rate).filter(v => v != null);
    const avgRate = rates.length > 0 ? Math.round(rates.reduce((s, v) => s + v, 0) / rates.length * 10) / 10 : null;
    const avgPrev = prevRates.length > 0 ? Math.round(prevRates.reduce((s, v) => s + v, 0) / prevRates.length * 10) / 10 : null;
    const selfOwned = blds.filter(b => b.asset_type === '自持园区').length;
    const leased = blds.filter(b => b.asset_type === '租赁职场').length;
    const failing = blds.filter(b => b.overall_rate != null && b.overall_rate < 100).length;
    let trend = '';
    if (avgRate != null && avgPrev != null) {
      const diff = avgRate - avgPrev;
      if (diff > 2) trend = `<span style="color:#4a7c5f;font-size:0.7rem">▲ ${diff.toFixed(1)}%</span>`;
      else if (diff < -2) trend = `<span style="color:#b05050;font-size:0.7rem">▼ ${Math.abs(diff).toFixed(1)}%</span>`;
      else trend = `<span style="color:#94a3b8;font-size:0.7rem">→</span>`;
    }
    return { region: r, avgRate, avgPrev, selfOwned, leased, failing, total: blds.length, trend };
  });

  container.innerHTML = regionData.map(r => {
    const rateColor = r.avgRate != null ? (r.avgRate >= 90 ? '#4a7c5f' : r.avgRate >= 70 ? '#9a7541' : '#b05050') : '#94a3b8';
    const ringStyle = r.avgRate != null
      ? `background:conic-gradient(${rateColor} ${r.avgRate * 3.6}deg, #e2e8f0 ${r.avgRate * 3.6}deg)`
      : 'background:#e2e8f0';
    return `
      <div class="region-summary-card rounded-2xl border border-slate-200/70 bg-white/60 p-4 cursor-pointer hover:shadow-md hover:border-indigo-200 transition" onclick="window.drillToRegion('${r.region}')">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-semibold text-slate-700">${r.region}</span>
          <span class="text-xs text-slate-400">${r.total} 栋</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="relative flex items-center justify-center flex-shrink-0" style="width:56px;height:56px">
            <div class="absolute inset-0 rounded-full" style="${ringStyle}"></div>
            <div class="relative flex flex-col items-center justify-center w-[44px] h-[44px] rounded-full bg-white">
              <span class="text-sm font-bold" style="color:${rateColor}">${r.avgRate != null ? Math.round(r.avgRate) + '%' : '--'}</span>
            </div>
          </div>
          <div class="flex-1 text-xs space-y-0.5">
            <div class="flex justify-between text-slate-500">
              <span>自持/租赁</span>
              <span class="text-slate-600">${r.selfOwned}/${r.leased}</span>
            </div>
            <div class="flex justify-between text-slate-500">
              <span>未达标</span>
              <span style="color:${r.failing > 0 ? '#b05050' : '#4a7c5f'}">${r.failing} 栋</span>
            </div>
            <div class="flex justify-between text-slate-500">
              <span>趋势</span>
              ${r.trend}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ---- Drill to region ----
window.drillToRegion = function(region) {
  $('#filterRegion').value = region;
  state.selectedRegion = region;
  switchView('region');
};

// ---- Dimension Drill-Down ----
function showDimDrillDown(dimId, dimName) {
  const data = state.overviewData;
  if (!data) return;

  // Build a map of building_id -> building info
  const bldMap = {};
  for (const b of (data.building_rates || [])) {
    bldMap[b.building_id] = b;
  }

  // Get dimension rates per building
  const buildingRates = (data.building_dim_rates || [])
    .filter(dr => dr.dim_id === dimId)
    .map(dr => ({
      ...dr,
      ...(bldMap[dr.building_id] || {}),
    }))
    .filter(b => b.rate != null)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));

  const passing = buildingRates.filter(b => b.rate >= 100);
  const failing = buildingRates.filter(b => b.rate < 100);

  const rateBadge = (rate) => {
    if (rate == null) return '<span class="badge badge-gray">--</span>';
    const cls = rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red';
    return `<span class="badge ${cls}">${rate}%</span>`;
  };

  const rows = [...failing, ...passing].map((b, i) => `
    <tr>
      <td class="text-xs text-slate-400">${i + 1}</td>
      <td><a onclick="navigateToBuilding(${b.building_id})">${b.name || '-'}</a></td>
      <td class="text-xs">${b.region || '-'}</td>
      <td class="text-xs">${b.city || '-'}</td>
      <td class="text-xs">${b.asset_type || '-'}</td>
      <td>${rateBadge(b.rate)}</td>
    </tr>`).join('');

  const modal = $('#dimDrillModal');
  const title = $('#drillModalTitle');
  const body = $('#drillModalBody');

  if (title) title.textContent = `${dimName} (${dimId}) — 楼宇完成率`;
  if (body) {
    body.innerHTML = `
      <div class="flex items-center gap-4 mb-4 text-xs text-slate-500">
        <span>共 <b>${buildingRates.length}</b> 栋 | </span>
        <span style="color:#4a7c5f">达标 <b>${passing.length}</b> 栋</span>
        <span style="color:#b05050">未达标 <b>${failing.length}</b> 栋</span>
      </div>
      <table class="data-table">
        <thead><tr><th>#</th><th>楼宇</th><th>区域</th><th>城市</th><th>性质</th><th>完成率</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="text-center text-slate-400 py-8">暂无数据</td></tr>'}</tbody>
      </table>`;
  }
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeDimDrillDown() {
  const modal = $('#dimDrillModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// ---- Building Table ----
function renderBuildingTable(buildingRates) {
  const container = $('#buildingTableOverview');
  state.allBuildingRates = buildingRates || [];
  state.buildingSearchQuery = '';

  const rates = buildingRates || [];
  const passing = rates.filter(b => b.overall_rate != null && b.overall_rate >= 100).length;
  const failing = rates.filter(b => b.overall_rate != null && b.overall_rate < 100).length;

  container.innerHTML = `
    <div class="flex items-center gap-4 text-xs text-slate-500 cursor-pointer select-none" id="buildingToggle" title="点击展开/收起">
      <span class="text-lg leading-none transition-transform" id="buildingCaret">▶</span>
      <span>共 <b>${rates.length}</b> 栋</span>
      <span style="color:#4a7c5f">达标 <b>${passing}</b> 栋</span>
      <span style="color:#b05050">未达标 <b>${failing}</b> 栋</span>
      <span class="ml-auto text-xs text-slate-400" id="buildingExpandHint">点击展开</span>
    </div>
    <div id="buildingTableContent" class="hidden mt-3">
      <div class="flex items-center gap-3 mb-3">
        <input id="buildingTableSearch" class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm w-64 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100" placeholder="搜索楼宇名称、城市、区域…" autocomplete="off" />
        <span class="text-xs text-slate-400" id="buildingTableCount"></span>
        <button id="btnExportBuildings" class="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 transition">导出 CSV</button>
      </div>
      <div id="buildingTableBody"></div>
    </div>`;

  // Bind toggle
  $('#buildingToggle').addEventListener('click', () => {
    const content = $('#buildingTableContent');
    const caret = $('#buildingCaret');
    const hint = $('#buildingExpandHint');
    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
      content.classList.remove('hidden');
      caret.textContent = '▼';
      if (hint) hint.textContent = '点击收起';
      if (!state._buildingTableRendered) {
        bindBuildingTableControls();
        renderBuildingTableBody();
        state._buildingTableRendered = true;
      }
    } else {
      content.classList.add('hidden');
      caret.textContent = '▶';
      if (hint) hint.textContent = '点击展开';
    }
  });
}

function bindBuildingTableControls() {
  $('#btnExportBuildings').addEventListener('click', () => exportBuildingCSV());
  const searchInput = $('#buildingTableSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.buildingSearchQuery = searchInput.value;
      renderBuildingTableBody();
    });
  }
}

function renderBuildingTableBody() {
  const q = (state.buildingSearchQuery || '').toLowerCase().trim();
  let filtered = state.allBuildingRates || [];

  if (q) {
    filtered = filtered.filter(b =>
      (b.name || '').toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q) ||
      (b.region || '').toLowerCase().includes(q)
    );
  }

  // Sort
  const col = state.buildingSortCol || 'overall_rate';
  const dir = state.buildingSortDir === 'desc' ? -1 : 1;
  const sorted = [...filtered].sort((a, b) => {
    const va = a[col], vb = b[col];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb, 'zh');
    return dir * (va - vb);
  });

  const countEl = $('#buildingTableCount');
  if (countEl) countEl.textContent = `共 ${sorted.length} 栋`;

  const body = $('#buildingTableBody');
  if (!body) return;

  if (sorted.length === 0) {
    body.innerHTML = '<p class="text-sm text-slate-400 py-8 text-center">无匹配楼宇</p>';
    return;
  }

  const sortArrow = (c) => {
    if (c !== state.buildingSortCol) return '';
    return state.buildingSortDir === 'asc' ? ' ▲' : ' ▼';
  };
  const th = (label, col, cls) =>
    `<th class="${cls || ''}" style="cursor:pointer;user-select:none" onclick="window.sortBuildingTable('${col}')">${label}${sortArrow(col)}</th>`;

  const trendIcon = (b) => {
    if (b.overall_rate == null || b.prev_rate == null) return '';
    const diff = b.overall_rate - b.prev_rate;
    if (diff > 3) return ' <span style="color:#4a7c5f;font-size:0.7rem" title="+'+diff.toFixed(1)+'% vs H2 2025">▲</span>';
    if (diff < -3) return ' <span style="color:#b05050;font-size:0.7rem" title="'+diff.toFixed(1)+'% vs H2 2025">▼</span>';
    return ' <span style="color:#94a3b8;font-size:0.7rem" title="'+diff.toFixed(1)+'% vs H2 2025">→</span>';
  };

  const rows = sorted.map(b => {
    const rate = b.overall_rate;
    const rateClass = rate != null ? (rate >= 90 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
    return `
      <tr>
        <td><a onclick="navigateToBuilding(${b.building_id})">${b.name}</a></td>
        <td>${b.region || '-'}</td>
        <td>${b.city || '-'}</td>
        <td>${b.asset_type || '-'}</td>
        <td>${b.scale_tier || '-'}</td>
        <td class="text-right">${b.measures_count || 0}</td>
        <td class="text-right">${b.failing_dim_count || 0}</td>
        <td><span class="badge ${rateClass}">${rate != null ? rate + '%' : '无数据'}</span>${trendIcon(b)}</td>
      </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="frozen-pane" style="max-height:420px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px">
    <table class="data-table">
      <thead><tr>
        ${th('楼宇名称', 'name')}
        ${th('区域', 'region')}
        ${th('城市', 'city')}
        ${th('资产性质', 'asset_type')}
        ${th('规模分档', 'scale_tier')}
        ${th('改进措施数', 'measures_count', 'text-right')}
        ${th('未达标维度', 'failing_dim_count', 'text-right')}
        ${th('综合完成率', 'overall_rate')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

window.sortBuildingTable = function(col) {
  if (state.buildingSortCol === col) {
    state.buildingSortDir = state.buildingSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.buildingSortCol = col;
    state.buildingSortDir = 'asc';
  }
  renderBuildingTableBody();
};

// ---- Measures Summary Table ----
function renderMeasuresTable(measureStats) {
  const total = (measureStats || []).reduce((s, m) => s + m.cnt, 0);
  const container = $('#measuresTableOverview');
  container.innerHTML = `
    <div class="flex items-center gap-4 text-xs text-slate-500 cursor-pointer select-none" id="measuresToggle" title="点击展开/收起">
      <span class="text-lg leading-none transition-transform" id="measuresCaret">▶</span>
      <span>总计: <b>${total}</b> 条</span>
      ${(measureStats || []).map(m => `<span class="badge ${m.status === '已完成' ? 'badge-green' : m.status === '进行中' ? 'badge-blue' : m.status === '超期' ? 'badge-red' : 'badge-gray'}">${m.status}: ${m.cnt}</span>`).join(' ')}
      <span class="ml-auto text-xs text-slate-400" id="measuresExpandHint">点击展开</span>
    </div>
    <div id="measuresTableContent" class="hidden mt-3"></div>`;

  $('#measuresToggle').addEventListener('click', () => {
    const content = $('#measuresTableContent');
    const caret = $('#measuresCaret');
    const hint = $('#measuresExpandHint');
    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
      content.classList.remove('hidden');
      caret.textContent = '▼';
      if (hint) hint.textContent = '点击收起';
      // Lazy load if not yet loaded
      if (!state._measuresLoaded) loadOverviewMeasures();
    } else {
      content.classList.add('hidden');
      caret.textContent = '▶';
      if (hint) hint.textContent = '点击展开';
    }
  });
}

async function loadOverviewMeasures() {
  try {
    const measures = await fetchMeasures({ limit: 200 });
    state._measuresLoaded = true;
    const container = $('#measuresTableContent');
    if (!container) return;

    // Store for client-side filtering
    state.overviewMeasures = dedupeMeasures(measures || []);
    state.measureFilter = { status: '', dim: '', phase: '' };

    // Clear loading placeholder
    container.innerHTML = '';

    if (!state.overviewMeasures.length) {
      container.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">暂无改进措施数据</p>';
      return;
    }

    renderOverviewMeasuresTable(container);
  } catch (err) {
    console.error('loadOverviewMeasures failed:', err);
    state._measuresLoaded = false;
    const container = $('#measuresTableContent');
    if (container) {
      container.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">改进措施数据加载失败，请检查网络后刷新页面</p>';
    }
  }
}

const STATUS_ORDER = { '超期': 0, '进行中': 1, '未开始': 2, '已完成': 3 };

const DIM_COLORS = {
  D15: '#6f7bb2', D16: '#91a79a', D17: '#c7a67a', D18: '#c69b9b',
  D01: '#8d9aa8', D02: '#b7a58f', D03: '#8fa6b8', D04: '#b9b7c9',
  D05: '#7a9a8c', D06: '#d4a88c', D07: '#8899b0', D08: '#c4a8a0',
  D09: '#9b9fc0', D10: '#b8b0a4', D11: '#a4b8c4', D12: '#d0b8b8',
  D13: '#a0b4a8', D14: '#c8b4a0',
};

function dedupeMeasures(list) {
  if (!list || !list.length) return list;
  const seen = new Set();
  return list.filter(m => {
    const key = `${m.building_id}||${(m.name || '').trim()}||${(m.dimension_ids || '').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dimBadgeStyle(dimIds) {
  if (!dimIds) return '';
  const firstId = dimIds.split(',')[0].trim();
  const color = DIM_COLORS[firstId] || '#8d9aa8';
  return `background:${color};color:#fff;border-color:${color}`;
}

function renderOverviewMeasuresFilter(container) {
  const dims = Object.entries(state.dimNameMap);
  const activeStatus = state.measureFilter.status;
  const phases = ['3个月内', '6个月内', '1年内', '1年以上'];
  const filterBar = document.createElement('div');
  filterBar.className = 'flex items-center gap-2 mb-3 flex-wrap';
  filterBar.id = 'measureFilterBar';
  filterBar.innerHTML = `
    <span class="text-xs text-slate-400">筛选:</span>
    <span class="filter-chip ${activeStatus === '' ? 'active' : ''}" data-status="">全部</span>
    <span class="filter-chip ${activeStatus === '超期' ? 'active' : ''}" data-status="超期">超期</span>
    <span class="filter-chip ${activeStatus === '进行中' ? 'active' : ''}" data-status="进行中">进行中</span>
    <span class="filter-chip ${activeStatus === '未开始' ? 'active' : ''}" data-status="未开始">未开始</span>
    <span class="filter-chip ${activeStatus === '已完成' ? 'active' : ''}" data-status="已完成">已完成</span>
    <span class="mx-1 text-slate-300">|</span>
    <select id="measureDimFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1">
      <option value="">全部维度</option>
      ${dims.map(([id, name]) => `<option value="${id}" ${state.measureFilter.dim === id ? 'selected' : ''}>${name}</option>`).join('')}
    </select>
    <select id="measurePhaseFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1">
      <option value="">全部阶段</option>
      ${phases.map(p => `<option value="${p}" ${state.measureFilter.phase === p ? 'selected' : ''}>${p}</option>`).join('')}
    </select>
    <span class="text-xs text-slate-400 ml-auto" id="measureBudgetSummary"></span>
    <button id="btnExportMeasures" class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 transition">导出 CSV</button>
  `;

  // Prepend filter bar (remove existing first)
  const existing = container.querySelector('#measureFilterBar');
  if (existing) existing.remove();
  const tableWrapper = container.querySelector('#measureTableWrapper');
  if (tableWrapper) {
    container.insertBefore(filterBar, tableWrapper);
  } else {
    container.appendChild(filterBar);
  }

  // Bind filter chip clicks
  filterBar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.measureFilter.status = chip.dataset.status;
      renderOverviewMeasuresTable(container);
    });
  });

  // Bind dimension filter
  const dimSelect = filterBar.querySelector('#measureDimFilter');
  if (dimSelect) {
    dimSelect.addEventListener('change', () => {
      state.measureFilter.dim = dimSelect.value;
      renderOverviewMeasuresTable(container);
    });
  }

  // Bind phase filter
  const phaseSelect = filterBar.querySelector('#measurePhaseFilter');
  if (phaseSelect) {
    phaseSelect.addEventListener('change', () => {
      state.measureFilter.phase = phaseSelect.value;
      renderOverviewMeasuresTable(container);
    });
  }

  // Bind export
  const exportBtn = filterBar.querySelector('#btnExportMeasures');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportMeasuresCSV());
  }
}

function renderOverviewMeasuresTable(container) {
  let measures = [...state.overviewMeasures];

  // Filter
  if (state.measureFilter.status) {
    measures = measures.filter(m => m.status === state.measureFilter.status);
  }
  if (state.measureFilter.dim) {
    measures = measures.filter(m => {
      const ids = (m.dimension_ids || '').split(',').map(s => s.trim());
      return ids.includes(state.measureFilter.dim);
    });
  }
  if (state.measureFilter.phase) {
    measures = measures.filter(m => m.completion_phase === state.measureFilter.phase);
  }

  // Sort: 超期 > 进行中 > 未开始 > 已完成
  measures.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  // Update filter bar (re-render chips to reflect active state)
  renderOverviewMeasuresFilter(container);

  // Update budget summary
  const totalBudget = measures.reduce((sum, m) => sum + (m.budget || 0), 0);
  const summaryEl = container.querySelector('#measureBudgetSummary');
  if (summaryEl) {
    const budgetStr = totalBudget > 0 ? `总预算: <b class="text-slate-700">¥${(totalBudget / 10000).toFixed(1)} 万</b>` : '';
    summaryEl.innerHTML = `${budgetStr ? budgetStr + ' · ' : ''}共 ${measures.length} 条`;
  }

  // Render table in scrollable frozen-pane
  let wrapper = container.querySelector('#measureTableWrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'measureTableWrapper';
    container.appendChild(wrapper);
  }
  wrapper.innerHTML = measures.length === 0
    ? '<p class="text-sm text-slate-400 py-4 text-center">无匹配的改进措施</p>'
    : `<div class="frozen-pane" style="max-height:420px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px">
        <table class="data-table">
          <thead><tr>
            <th>楼宇</th><th>区域</th><th>措施名称</th><th>维度</th><th>完成阶段</th><th>预算</th><th>状态</th>
          </tr></thead>
          <tbody>${measures.map(m => `
            <tr>
              <td><a onclick="navigateToBuilding(${m.building_id})">${m.building_name || '-'}</a></td>
              <td class="text-xs">${m.region || '-'}</td>
              <td class="max-w-[200px] text-xs" title="${(m.description || '').replace(/"/g, '&quot;')}">${m.name || '-'}</td>
              <td class="text-xs"><span class="badge" style="${dimBadgeStyle(m.dimension_ids)}">${dimIdToName(m.dimension_ids)}</span></td>
              <td class="text-xs">${m.completion_phase || '-'}</td>
              <td class="text-xs">${m.budget != null ? '¥' + (m.budget / 10000).toFixed(1) + '万' : '-'}</td>
              <td>
                <select class="measure-status-select rounded-lg border-slate-200 text-xs px-1 py-0.5" data-mid="${m.id}" data-bid="${m.building_id}">
                  <option value="未开始" ${m.status === '未开始' ? 'selected' : ''}>未开始</option>
                  <option value="进行中" ${m.status === '进行中' ? 'selected' : ''}>进行中</option>
                  <option value="已完成" ${m.status === '已完成' ? 'selected' : ''}>已完成</option>
                  <option value="超期" ${m.status === '超期' ? 'selected' : ''}>超期</option>
                </select>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;

  // Status change handlers
  wrapper.querySelectorAll('.measure-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const mid = sel.dataset.mid;
      const bid = sel.dataset.bid;
      const newStatus = sel.value;
      try {
        await updateMeasure(bid, mid, { status: newStatus });
        // Update local cache
        const cached = state.overviewMeasures.find(m => m.id == mid);
        if (cached) cached.status = newStatus;
        showToast('状态已更新', 'success');
      } catch (err) {
        showToast('更新失败', 'error');
      }
    });
  });
}

// ============================================================
// VIEW 2: 区域下钻
// ============================================================
async function loadRegionView() {
  state._regionMeasuresLoaded = false;
  state._regionData = null;
  const selRegion = $('#filterRegion').value;
  const regions = ['京区', '北区', '东区', '西区', '南区'];

  // Get building counts per region
  let regionCounts = {};
  try {
    const allBuildings = await getBuildings();
    regions.forEach(r => { regionCounts[r] = allBuildings.filter(b => b.region === r).length; });
  } catch (e) {
    console.error('Failed to load building counts for region tabs:', e);
  }

  // Region tabs
  $('#regionTabs').innerHTML = regions.map(r => `
    <span class="region-tag ${r === (selRegion || '京区') ? 'active' : ''}" data-region="${r}">${r}<span class="text-slate-400 ml-1 text-xs">${regionCounts[r] || 0}栋</span></span>
  `).join('');

  // Region tab click
  $$('.region-tag').forEach(tag => {
    tag.addEventListener('click', async () => {
      $$('.region-tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      state.selectedRegion = tag.dataset.region;
      await loadRegionData(tag.dataset.region);
    });
  });

  state.selectedRegion = selRegion || '京区';
  await loadRegionData(state.selectedRegion);
}

async function loadRegionData(regionId) {
  const panel = $('#viewRegion');
  showLoading(panel);
  state._regionMeasuresLoaded = false;
  try {
    const data = await fetchRegion(regionId);
    state._regionData = data;
    renderKpiCards(data, 'regionKpiCards');
    renderDimBarChart('chartRegionDim', data.dimension_rates);
    $('#regionChartTitle').textContent = `${regionId} - 维度达标率`;
    renderAssetCompareChart('chartRegionAssetCompare', data);
    renderRegionBuildingTable(data.building_rates || []);
    renderRegionMeasures(data.measure_stats || []);
  } catch (err) {
    console.error('loadRegionData failed:', err);
  } finally {
    hideLoading(panel);
  }
}

function renderRegionBuildingTable(buildingRates) {
  const container = $('#regionBuildingTable');
  state.regionBuildingData = buildingRates || [];
  state.regionBuildingSortCol = 'overall_rate';
  state.regionBuildingSortDir = 'asc';
  renderRegionBuildingTableBody();
}

function renderRegionBuildingTableBody() {
  const container = $('#regionBuildingTable');
  const data = state.regionBuildingData || [];
  const col = state.regionBuildingSortCol;
  const dir = state.regionBuildingSortDir === 'desc' ? -1 : 1;

  const sorted = [...data].sort((a, b) => {
    const va = a[col], vb = b[col];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb, 'zh');
    return dir * (va - vb);
  });

  const sortArrow = (c) => {
    if (c !== state.regionBuildingSortCol) return '';
    return state.regionBuildingSortDir === 'asc' ? ' ▲' : ' ▼';
  };
  const th = (label, col, cls) =>
    `<th class="${cls || ''}" style="cursor:pointer;user-select:none" onclick="window.sortRegionBuildingTable('${col}')">${label}${sortArrow(col)}</th>`;

  const trendIcon = (b) => {
    if (b.overall_rate == null || b.prev_rate == null) return '';
    const diff = b.overall_rate - b.prev_rate;
    if (diff > 3) return ' <span style="color:#4a7c5f;font-size:0.7rem" title="+'+diff.toFixed(1)+'% vs H2 2025">▲</span>';
    if (diff < -3) return ' <span style="color:#b05050;font-size:0.7rem" title="'+diff.toFixed(1)+'% vs H2 2025">▼</span>';
    return ' <span style="color:#94a3b8;font-size:0.7rem" title="'+diff.toFixed(1)+'% vs H2 2025">→</span>';
  };

  const rows = sorted.map((b, i) => {
    const rate = b.overall_rate;
    const rateClass = rate != null ? (rate >= 90 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
    return `
      <tr>
        <td class="text-xs text-slate-400">${i + 1}</td>
        <td><a onclick="navigateToBuilding(${b.building_id})">${b.name}</a></td>
        <td>${b.city || '-'}</td>
        <td>${b.asset_type || '-'}</td>
        <td class="text-right">${b.measures_count || 0}</td>
        <td class="text-right">${b.failing_dim_count || 0}</td>
        <td><span class="badge ${rateClass}">${rate != null ? rate + '%' : '无数据'}</span>${trendIcon(b)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>#</th>
        ${th('楼宇名称', 'name')}
        ${th('城市', 'city')}
        ${th('资产性质', 'asset_type')}
        ${th('改进措施', 'measures_count', 'text-right')}
        ${th('未达标维度', 'failing_dim_count', 'text-right')}
        ${th('综合完成率', 'overall_rate')}
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="text-center text-slate-400 py-8">暂无数据</td></tr>'}</tbody>
    </table>`;
}

window.sortRegionBuildingTable = function(col) {
  if (state.regionBuildingSortCol === col) {
    state.regionBuildingSortDir = state.regionBuildingSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.regionBuildingSortCol = col;
    state.regionBuildingSortDir = 'asc';
  }
  renderRegionBuildingTableBody();
};

// ---- Region Measures ----
function renderRegionMeasures(measureStats) {
  const container = $('#regionMeasuresTable');
  const total = (measureStats || []).reduce((s, m) => s + m.cnt, 0);
  container.innerHTML = `
    <div class="flex items-center gap-4 text-xs text-slate-500 cursor-pointer select-none" id="regionMeasuresToggle" title="点击展开/收起">
      <span class="text-lg leading-none transition-transform" id="regionMeasuresCaret">▶</span>
      <span>总计: <b>${total}</b> 条</span>
      ${(measureStats || []).map(m => `<span class="badge ${m.status === '已完成' ? 'badge-green' : m.status === '进行中' ? 'badge-blue' : m.status === '超期' ? 'badge-red' : 'badge-gray'}">${m.status}: ${m.cnt}</span>`).join(' ')}
      <span class="ml-auto text-xs text-slate-400" id="regionMeasuresHint">点击展开</span>
    </div>
    <div id="regionMeasuresContent" class="hidden mt-3"></div>`;

  $('#regionMeasuresToggle').addEventListener('click', async () => {
    const content = $('#regionMeasuresContent');
    const caret = $('#regionMeasuresCaret');
    const hint = $('#regionMeasuresHint');
    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
      content.classList.remove('hidden');
      caret.textContent = '▼';
      if (hint) hint.textContent = '点击收起';
      if (!state._regionMeasuresLoaded) {
        content.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">加载中…</p>';
        try {
          const measures = await fetchMeasures({ region: state.selectedRegion, limit: 200 });
          state._regionMeasures = dedupeMeasures(measures || []);
          state._regionMeasuresLoaded = true;
          renderRegionMeasuresTable(measures);
        } catch (e) {
          content.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">加载失败</p>';
        }
      } else {
        renderRegionMeasuresTable(state._regionMeasures || []);
      }
    } else {
      content.classList.add('hidden');
      caret.textContent = '▶';
      if (hint) hint.textContent = '点击展开';
    }
  });
}

function renderRegionMeasuresTable(measures) {
  const container = $('#regionMeasuresContent');
  if (!measures.length) {
    container.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">暂无改进措施</p>';
    return;
  }
  measures.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  const totalBudget = measures.reduce((sum, m) => sum + (m.budget || 0), 0);
  container.innerHTML = `
    <div class="flex items-center gap-2 mb-2 text-xs text-slate-400">
      ${totalBudget > 0 ? `<span>总预算: <b class="text-slate-700">¥${(totalBudget / 10000).toFixed(1)} 万</b> · </span>` : ''}
      <span>共 ${measures.length} 条</span>
    </div>
    <div class="frozen-pane" style="max-height:360px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px">
    <table class="data-table">
      <thead><tr>
        <th>楼宇</th><th>措施名称</th><th>维度</th><th>完成阶段</th><th>预算</th><th>状态</th>
      </tr></thead>
      <tbody>${measures.map(m => `
        <tr>
          <td><a onclick="navigateToBuilding(${m.building_id})">${m.building_name || '-'}</a></td>
          <td class="max-w-[200px] text-xs" title="${(m.description || '').replace(/"/g, '&quot;')}">${m.name || '-'}</td>
          <td class="text-xs"><span class="badge" style="${dimBadgeStyle(m.dimension_ids)}">${dimIdToName(m.dimension_ids)}</span></td>
          <td class="text-xs">${m.completion_phase || '-'}</td>
          <td class="text-xs">${m.budget != null ? '¥' + (m.budget / 10000).toFixed(1) + '万' : '-'}</td>
          <td><span class="badge ${m.status === '已完成' ? 'badge-green' : m.status === '进行中' ? 'badge-blue' : m.status === '超期' ? 'badge-red' : 'badge-gray'}">${m.status}</span></td>
        </tr>`).join('')}</tbody>
    </table>
    </div>`;
}

// ============================================================
// VIEW 3: 单楼宇下钻
// ============================================================
async function navigateToBuilding(buildingId) {
  state.selectedBuildingId = buildingId;
  switchView('building');
}

async function loadBuildingView(buildingId) {
  state.selectedBuildingId = buildingId || null;
  state.dirtyValues = {};
  state.selectedDimId = null;

  // Setup building selector
  await setupBuildingSelect(buildingId);

  if (!buildingId) {
    // No building selected: show placeholder, hide data sections
    $('#buildingInfoCard').innerHTML = '<div class="text-center py-12 text-slate-400"><p class="text-lg mb-2">请选择楼宇</p><p class="text-sm">通过上方搜索框选择要查看的楼宇</p></div>';
    $('#dimensionTabs').innerHTML = '';
    $('#dimensionDetail').innerHTML = '';
    $('#buildingMeasures').innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">请先选择楼宇</p>';
    $('#assetModuleContent').innerHTML = '<div class="text-center py-10 text-slate-400"><p class="text-sm">请先选择楼宇</p></div>';
    $('#energyModuleContent').innerHTML = '<div class="text-center py-10 text-slate-400"><p class="text-sm">请先选择楼宇</p></div>';
    $('#costModuleContent').innerHTML = '<div class="text-center py-10 text-slate-400"><p class="text-sm">请先选择楼宇</p></div>';
    return;
  }

  // Load data
  await reloadIndicatorsForCurrentPeriod();

  // Back button
  $('#btnBackFromBuilding').onclick = () => {
    const prevView = state.selectedRegion ? 'region' : 'overview';
    switchView(prevView);
  };

  // Period switcher
  const periodSwitcher = $('#indicatorPeriodSwitcher');
  if (periodSwitcher) {
    periodSwitcher.value = state.currentPeriod;
    periodSwitcher.onchange = async () => {
      state.currentPeriod = periodSwitcher.value;
      state.dirtyValues = {};
      await reloadIndicatorsForCurrentPeriod();
    };
  }
}

async function reloadIndicatorsForCurrentPeriod() {
  if (!state.selectedBuildingId) return;
  const panel = $('#viewBuilding');
  showLoading(panel);
  try {
    state.buildingIndicatorsData = await fetchBuildingIndicators(state.selectedBuildingId, state.currentPeriod);
    const data = state.buildingIndicatorsData;
    renderBuildingInfo(data, state.selectedBuildingId);
    renderDimensionTabs(data.dimensions);
    await renderBuildingMeasures();
    await updateRadarChart(state.selectedBuildingId);
    renderAssetModule(state.selectedBuildingId);
    renderEnergyModule(state.selectedBuildingId);
    renderCostModule();
  } catch (err) {
    console.error('loadBuildingView failed:', err);
    showToast('加载楼宇数据失败', 'error');
  } finally {
    hideLoading(panel);
  }
}

async function setupBuildingSelect(selectedId) {
  const buildings = await getBuildings();
  const selectedBld = buildings.find(b => b.id == selectedId);

  function filterBuildings(query) {
    const q = query.toLowerCase().trim();
    if (!q) return buildings.slice(0, 50);
    return buildings.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q) ||
      (b.region || '').toLowerCase().includes(q) ||
      (b.province || '').toLowerCase().includes(q)
    );
  }

  function renderDropdown(list) {
    const dropdown = document.getElementById('buildingDropdown');
    if (!dropdown) return;
    const shown = list.slice(0, 50);
    if (shown.length === 0) {
      dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400">未找到匹配楼宇</div>';
      return;
    }
    dropdown.innerHTML = shown.map(b => `
      <div class="building-option px-3 py-2 text-sm cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50 ${b.id == selectedId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}"
           data-bid="${b.id}">
        <div>${b.name}</div>
        <div class="text-xs text-slate-400">${b.region} · ${b.city} · ${b.asset_type}</div>
      </div>`).join('');

    dropdown.querySelectorAll('.building-option').forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const bid = parseInt(opt.dataset.bid);
        const dd = document.getElementById('buildingDropdown');
        if (dd) dd.style.display = 'none';
        loadBuildingView(bid);
      });
    });
  }

  // Check if search wrap already exists
  let wrap = document.getElementById('buildingSearchWrap');

  if (!wrap) {
    // First time: replace select with searchable input
    const container = document.getElementById('buildingSelect');
    if (!container) return;

    const wrapHTML = `
      <div class="relative" id="buildingSearchWrap" style="min-width:280px">
        <input id="buildingSearchInput" class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm w-full focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
               placeholder="搜索楼宇名称或城市..." autocomplete="off" />
        <div id="buildingDropdown" style="display:none;position:absolute;top:100%;left:0;margin-top:4px;max-height:260px;width:100%;overflow-y:auto;border-radius:12px;border:1px solid #e2e8f0;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,0.1);z-index:50"></div>
      </div>`;
    container.insertAdjacentHTML('afterend', wrapHTML);
    container.remove();

    // Set up input event listeners once
    const input = document.getElementById('buildingSearchInput');
    if (input) {
      input.addEventListener('focus', () => {
        const dd = document.getElementById('buildingDropdown');
        if (!dd) return;
        renderDropdown(filterBuildings(input.value));
        dd.style.display = 'block';
      });
      input.addEventListener('input', () => {
        const dd = document.getElementById('buildingDropdown');
        if (!dd) return;
        renderDropdown(filterBuildings(input.value));
        dd.style.display = 'block';
      });
      input.addEventListener('click', () => {
        const dd = document.getElementById('buildingDropdown');
        if (!dd) return;
        renderDropdown(filterBuildings(input.value));
        dd.style.display = 'block';
      });
    }

    // Single global click-to-dismiss handler
    document.addEventListener('click', function hideBuildingDropdown(e) {
      const dd = document.getElementById('buildingDropdown');
      const inp = document.getElementById('buildingSearchInput');
      if (!dd) return;
      if (!dd.contains(e.target) && e.target !== inp) {
        dd.style.display = 'none';
      }
    });
  }

  // Update input value for current building
  const input = document.getElementById('buildingSearchInput');
  if (input) {
    input.value = selectedBld ? `${selectedBld.name} (${selectedBld.region} · ${selectedBld.city})` : '';
  }
  const dropdown = document.getElementById('buildingDropdown');
  if (dropdown) dropdown.style.display = 'none';
}

async function renderBuildingInfo(data, buildingId) {
  let b;
  try {
    const buildings = await getBuildings();
    b = buildings.find(x => x.id == buildingId);
  } catch (err) {
    console.error('Failed to load building info:', err);
    return;
  }
  if (!b) return;

  $('#buildingBreadcrumb').textContent = `${b.region} > ${b.city} > ${b.district || ''}`;

  const editableFields = [
    { key: 'headcount', label: '工位数', type: 'number', fmt: v => v != null ? v : '未填写' },
    { key: 'building_age', label: '楼龄', type: 'number', fmt: v => v != null ? `${v} 年` : '未填写' },
    { key: 'area_sqm', label: '面积(㎡)', type: 'number', fmt: v => v != null ? `${v} ㎡` : '未填写' },
    { key: 'floors', label: '层数', type: 'number', fmt: v => v || '未填写' },
    { key: 'access_gates', label: '门禁数', type: 'number', fmt: v => v || '未填写' },
    { key: 'business_lines', label: '业务线', type: 'text', fmt: v => v || '-' },
    { key: 'supplier', label: '供应商', type: 'text', fmt: v => v || '-' },
    { key: 'day1_date', label: 'Day1时间', type: 'text', fmt: v => v || '-' },
  ];

  // Static fields
  const staticFields = [
    ['城市/区域', `${b.city || '-'} / ${b.region || '-'}`],
    ['资产性质', b.asset_type || '-'],
  ];

  $('#buildingInfoCard').innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-lg font-semibold text-slate-800">${b.name}</h3>
      <div class="flex items-center gap-2">
        <button onclick="saveBuildingInfo(${b.id})" class="rounded-xl bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600 transition">保存信息</button>
        <span class="badge ${b.asset_type === '自持园区' ? 'badge-indigo' : 'badge-amber'}" style="background:${b.asset_type === '自持园区' ? 'rgba(111,123,178,0.12)' : 'rgba(199,166,122,0.15)'};color:${b.asset_type === '自持园区' ? '#41558b' : '#9a7541'}">${b.asset_type}</span>
      </div>
    </div>
    <div class="grid grid-cols-6 gap-3 text-sm">
      ${staticFields.map(f => `<div><span class="text-slate-400">${f[0]}</span><br><span class="text-slate-700">${f[1]}</span></div>`).join('')}
      ${editableFields.map(f => `
        <div>
          <span class="text-slate-400">${f.label}</span><br>
          <input class="building-editable rounded-lg border border-slate-200 px-1.5 py-0.5 text-sm text-slate-700 w-full mt-0.5 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                 data-field="${f.key}" type="${f.type}" value="${b[f.key] != null ? b[f.key] : ''}" placeholder="填写" />
        </div>`).join('')}
    </div>`;
}

async function saveBuildingInfo(buildingId) {
  const inputs = document.querySelectorAll('.building-editable');
  const data = {};
  inputs.forEach(inp => {
    const key = inp.dataset.field;
    const val = inp.value.trim();
    if (val === '') {
      data[key] = null;
    } else if (inp.type === 'number') {
      data[key] = parseFloat(val);
    } else {
      data[key] = val;
    }
  });

  try {
    await apiPut(`/api/buildings/${buildingId}`, data);
    clearCache();
    showToast('楼宇信息已保存', 'success');
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

// ---- Dimension Tabs ----
function renderDimensionTabs(dimensions) {
  const container = $('#dimensionTabs');
  if (!dimensions || dimensions.length === 0) return;

  container.innerHTML = dimensions.map(d => {
    const rate = d.completion_rate;
    const rateStr = rate != null ? rate + '%' : '--';
    // Color based on pass/fail: green if ≥100, amber 70-99, red <70
    let statusColor, bgColor;
    if (rate == null) { statusColor = '#94a3b8'; bgColor = '#f8fafc'; }
    else if (rate >= 100) { statusColor = '#4a7c5f'; bgColor = '#f0f7f2'; }
    else if (rate >= 70) { statusColor = '#9a7541'; bgColor = '#fef9f0'; }
    else { statusColor = '#b05050'; bgColor = '#fef5f5'; }
    const rateCls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
    const isActive = !state.selectedDimId && d.dimension_id === dimensions[0].dimension_id;
    return `<span class="dim-tab ${isActive ? 'active' : ''}" data-dim="${d.dimension_id}" style="border-left:3px solid ${statusColor};background:${bgColor}">
      ${d.dimension_name} <span class="badge ${rateCls}" style="font-size:0.65rem">${rateStr}</span>
    </span>`;
  }).join('');

  // Click handlers
  $$('.dim-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.dim-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.selectedDimId = tab.dataset.dim;
      renderDimensionDetail(tab.dataset.dim);
    });
  });

  // Show first dimension by default
  const firstDim = dimensions[0];
  if (firstDim) {
    state.selectedDimId = firstDim.dimension_id;
    renderDimensionDetail(firstDim.dimension_id);
  }
}

// ---- Dimension Detail Table (editable) ----
function renderDimensionDetail(dimId) {
  const container = $('#dimensionDetail');
  const data = state.buildingIndicatorsData;
  if (!data) return;

  const dimIndicators = (data.indicators || []).filter(i => i.dimension_id === dimId);
  if (dimIndicators.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 py-8 text-center">该维度下无指标数据</p>';
    return;
  }

  const periodLabel = state.currentPeriod === 'H1_2026' ? 'H1 2026 实际值' : 'H2 2025 实际值';
  const compareLabel = state.currentPeriod === 'H1_2026' ? 'H2 2025 实际值' : 'H1 2026 实际值';

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>指标名称</th><th>类别</th><th>口径定义</th><th>目标值</th><th style="min-width:100px">${periodLabel}</th><th>${compareLabel}</th><th>完成率</th><th>单位</th><th>数据来源</th>
        </tr>
      </thead>
      <tbody>
        ${dimIndicators.map(ind => {
          const actualVal = state.dirtyValues[ind.id] !== undefined ? state.dirtyValues[ind.id] : ind.actual_value;
          const isDirty = state.dirtyValues[ind.id] !== undefined;
          const rate = ind.completion_rate;
          const rateStr = rate != null ? rate + '%' : '--';
          const rateCls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
          const targetHint = ind.target_value || '';
          return `
            <tr class="${isDirty ? 'bg-amber-50/30' : ''}">
              <td class="font-medium">${ind.name}${isDirty ? ' <span class="text-amber-500 text-xs">*</span>' : ''}</td>
              <td><span class="badge ${ind.category === '核心指标' ? 'badge-red' : ind.category === '体验指标' ? 'badge-blue' : 'badge-gray'}">${ind.category || '运营'}</span></td>
              <td class="text-xs text-slate-500 max-w-[180px]">${ind.definition || '-'}</td>
              <td class="text-xs">${ind.target_value || '-'}</td>
              <td><input class="ind-input ${isDirty ? 'ring-amber-300 border-amber-300' : ''}" data-ind="${ind.id}" data-target="${ind.target_value || ''}" data-target-type="${ind.target_type || ''}" type="number" step="any" value="${actualVal != null ? actualVal : ''}" placeholder="${targetHint ? '目标: ' + targetHint : '填写'}" title="${targetHint ? '目标: ' + targetHint : ''}" /></td>
              <td class="text-xs text-slate-400">${ind.prev_value != null ? ind.prev_value : '--'}</td>
              <td><span class="badge ${rateCls}" data-rate-cell="${ind.id}">${rateStr}</span></td>
              <td class="text-xs text-slate-400">${ind.unit || '-'}</td>
              <td class="text-xs text-slate-400">${ind.data_source || '-'}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  // Input handlers: mark dirty on input, auto-save on blur
  container.querySelectorAll('.ind-input').forEach(input => {
    const indId = input.dataset.ind;

    input.addEventListener('input', () => {
      const val = input.value.trim();
      const numVal = val === '' ? null : parseFloat(val);
      state.dirtyValues[indId] = numVal;
      input.classList.add('ring-amber-300', 'border-amber-300');
      const row = input.closest('tr');
      if (row && !row.classList.contains('bg-amber-50/30')) {
        row.classList.add('bg-amber-50/30');
      }
      // Live rate preview
      const rateCell = container.querySelector(`[data-rate-cell="${indId}"]`);
      if (rateCell) {
        const previewRate = calcPreviewRate(numVal, input.dataset.target || '', input.dataset.targetType || '');
        if (previewRate != null) {
          const cls = previewRate >= 100 ? 'badge-green' : previewRate >= 70 ? 'badge-amber' : 'badge-red';
          rateCell.className = `badge ${cls}`;
          rateCell.textContent = previewRate + '%';
        }
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Tab') {
        // Move to next input in next row
        const allInputs = [...container.querySelectorAll('.ind-input')];
        const idx = allInputs.indexOf(input);
        if (idx >= 0 && idx < allInputs.length - 1) {
          e.preventDefault();
          allInputs[idx + 1].focus();
          allInputs[idx + 1].select();
        }
      }
    });

    input.addEventListener('blur', async () => {
      const val = input.value.trim();
      const actualValue = val === '' ? null : parseFloat(val);
      state.dirtyValues[indId] = actualValue;

      if (state.dirtyValues[indId] !== undefined) {
        // Auto-save single indicator
        try {
          await saveBuildingIndicators(state.selectedBuildingId, state.currentPeriod, [
            { indicator_id: indId, actual_value: actualValue, notes: '' }
          ]);
          delete state.dirtyValues[indId];
          input.classList.remove('ring-amber-300', 'border-amber-300');
          const row = input.closest('tr');
          if (row) row.classList.remove('bg-amber-50/30');
          // Reload to get updated rates
          state.buildingIndicatorsData = await fetchBuildingIndicators(state.selectedBuildingId, state.currentPeriod);
          const updatedInd = (state.buildingIndicatorsData.indicators || []).find(i => i.id === indId);
          if (updatedInd) {
            const rate = updatedInd.completion_rate;
            const rateCell = container.querySelector(`[data-rate-cell="${indId}"]`);
            if (rateCell) {
              const rateStr = rate != null ? rate + '%' : '--';
              const rateCls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
              rateCell.className = `badge ${rateCls}`;
              rateCell.textContent = rateStr;
            }
          }
          // Update dimension tabs
          const dims = state.buildingIndicatorsData.dimensions;
          if (dims) {
            const tabs = $$('.dim-tab');
            tabs.forEach(tab => {
              const dimId = tab.dataset.dim;
              const dim = dims.find(d => d.dimension_id === dimId);
              if (dim) {
                const rate = dim.completion_rate;
                const rateStr = rate != null ? rate + '%' : '--';
                const rateCls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
                // Update badge
                const badge = tab.querySelector('.badge');
                if (badge) {
                  badge.className = `badge ${rateCls}`;
                  badge.textContent = rateStr;
                }
                // Update tab border + background
                let statusColor, bgColor;
                if (rate == null) { statusColor = '#94a3b8'; bgColor = '#f8fafc'; }
                else if (rate >= 100) { statusColor = '#4a7c5f'; bgColor = '#f0f7f2'; }
                else if (rate >= 70) { statusColor = '#9a7541'; bgColor = '#fef9f0'; }
                else { statusColor = '#b05050'; bgColor = '#fef5f5'; }
                tab.style.borderLeftColor = statusColor;
                tab.style.background = bgColor;
              }
            });
          }
          showToast('已自动保存', 'success');
        } catch (err) {
          console.error('Auto-save failed:', err);
          showToast('自动保存失败', 'error');
        }
      }
    });
  });
}

// ---- Save Indicators ----
$('#btnSaveIndicators').addEventListener('click', async () => {
  if (Object.keys(state.dirtyValues).length === 0) {
    showToast('没有需要保存的修改', 'error');
    return;
  }

  const values = Object.entries(state.dirtyValues).map(([indicator_id, actual_value]) => ({
    indicator_id, actual_value, notes: ''
  }));

  try {
    await saveBuildingIndicators(state.selectedBuildingId, state.currentPeriod, values);
    state.dirtyValues = {};
    showToast('保存成功', 'success');
    // Reload data
    state.buildingIndicatorsData = await fetchBuildingIndicators(state.selectedBuildingId, state.currentPeriod);
    const data = state.buildingIndicatorsData;
    renderDimensionTabs(data.dimensions);
    if (state.selectedDimId) renderDimensionDetail(state.selectedDimId);
    await updateRadarChart(state.selectedBuildingId);
  } catch (err) {
    console.error('Save failed:', err);
    showToast('保存失败: ' + err.message, 'error');
  }
});

// ---- Radar Chart Update ----
async function updateRadarChart(buildingId) {
  try {
    const h1Data = await fetchBuildingIndicators(buildingId, 'H1_2026');
    const h2Data = await fetchBuildingIndicators(buildingId, 'H2_2025');
    state.radarData = { h1: h1Data, h2: h2Data };
    renderRadarChart('chartRadar', h1Data.dimensions, h2Data.dimensions);
  } catch (err) {
    console.error('Radar chart load failed:', err);
    state.radarData = null;
  }
  renderBuildingPortrait();
}

// ---- Building Portrait Analysis ----
function renderBuildingPortrait() {
  const container = document.getElementById('portraitContent');
  if (!container) return;

  const data = state.buildingIndicatorsData;
  if (!data || !data.dimensions || data.dimensions.length === 0) {
    container.innerHTML = '<div class="flex flex-col items-center justify-center py-8 text-slate-400"><p class="text-sm">暂无数据</p></div>';
    return;
  }

  const dims = [...data.dimensions];
  const measures = state.buildingMeasuresAll || [];

  // Composite score: average of dimension rates
  const rates = dims.map(d => d.completion_rate).filter(r => r != null);
  const compositeScore = rates.length > 0
    ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length)
    : null;

  // Score grade
  let grade, gradeColor, gradeBg;
  if (compositeScore == null) { grade = '--'; gradeColor = '#94a3b8'; gradeBg = '#f8fafc'; }
  else if (compositeScore >= 95) { grade = '优秀'; gradeColor = '#4a7c5f'; gradeBg = '#f0f7f2'; }
  else if (compositeScore >= 80) { grade = '良好'; gradeColor = '#41558b'; gradeBg = '#eef2f8'; }
  else if (compositeScore >= 60) { grade = '一般'; gradeColor = '#9a7541'; gradeBg = '#fef9f0'; }
  else { grade = '待改善'; gradeColor = '#b05050'; gradeBg = '#fef5f5'; }

  // Sort by rate
  const sortedAsc = [...dims].sort((a, b) => (a.completion_rate ?? 0) - (b.completion_rate ?? 0));
  const sortedDesc = [...dims].sort((a, b) => (b.completion_rate ?? 0) - (a.completion_rate ?? 0));

  // Top 3 strengths (highest rates, >= 80)
  const strengths = sortedDesc.filter(d => d.completion_rate != null && d.completion_rate >= 80).slice(0, 3);

  // Top 3 risks (lowest rates)
  const risks = sortedAsc.filter(d => d.completion_rate != null && d.completion_rate < 100).slice(0, 3);

  // Trend: compare H1 vs H2
  let trendSummary = '';
  if (state.radarData && state.radarData.h1 && state.radarData.h2) {
    const h1Dims = state.radarData.h1.dimensions || [];
    const h2Dims = state.radarData.h2.dimensions || [];
    const h2Map = {};
    h2Dims.forEach(d => { h2Map[d.dimension_id] = d.completion_rate; });

    let improved = 0, declined = 0, stable = 0;
    h1Dims.forEach(d => {
      const prev = h2Map[d.dimension_id];
      if (d.completion_rate != null && prev != null) {
        const diff = d.completion_rate - prev;
        if (diff > 2) improved++;
        else if (diff < -2) declined++;
        else stable++;
      }
    });
    const parts = [];
    if (improved > 0) parts.push(`<span style="color:#4a7c5f">${improved} 项提升</span>`);
    if (declined > 0) parts.push(`<span style="color:#b05050">${declined} 项下降</span>`);
    if (stable > 0) parts.push(`<span style="color:#94a3b8">${stable} 项持平</span>`);
    trendSummary = parts.join(' / ') || '暂无趋势数据';
  } else {
    trendSummary = '<span style="color:#94a3b8">数据加载中</span>';
  }

  // Recommended actions based on risks + available measures
  const recommendations = risks.map((dim, i) => {
    const linkedMeasures = measures.filter(m => {
      if (!m.dimension_ids) return false;
      return m.dimension_ids.split(',').map(s => s.trim()).includes(dim.dimension_id);
    });
    const priority = i === 0 ? '最优先' : i === 1 ? '尽快' : '关注';
    return {
      priority,
      dimName: dim.dimension_name,
      dimId: dim.dimension_id,
      rate: dim.completion_rate,
      measureCount: linkedMeasures.length,
    };
  });

  // Build HTML
  const scoreHtml = compositeScore != null
    ? `<div class="flex items-center gap-4 mb-4">
        <div class="flex flex-col items-center justify-center rounded-2xl px-6 py-4" style="background:${gradeBg};min-width:90px">
          <span class="text-3xl font-bold" style="color:${gradeColor}">${compositeScore}</span>
          <span class="text-xs font-medium mt-0.5" style="color:${gradeColor}">${grade}</span>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs text-slate-500">趋势 (vs H2 2025):</span>
            <span class="text-xs font-medium">${trendSummary}</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${sortedDesc.slice(0, 6).map(d => {
              const rate = d.completion_rate;
              const cls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
              return `<span class="badge ${cls}" style="font-size:0.6rem" title="${d.dimension_name}">${d.dimension_name}: ${rate != null ? rate + '%' : '--'}</span>`;
            }).join('')}
          </div>
        </div>
      </div>`
    : '<div class="text-center py-4 text-slate-400 text-sm">综合数据暂不可用</div>';

  const strengthsHtml = strengths.length > 0
    ? `<div class="mb-3">
        <p class="text-xs font-semibold text-slate-600 mb-1.5">亮点维度</p>
        ${strengths.map(d => `<div class="flex items-center justify-between mb-0.5 text-xs">
          <span class="text-slate-600">${d.dimension_name}</span>
          <span class="badge badge-green" style="font-size:0.6rem">${d.completion_rate != null ? d.completion_rate + '%' : '--'}</span>
        </div>`).join('')}
      </div>`
    : '';

  const risksHtml = risks.length > 0
    ? `<div class="mb-3">
        <p class="text-xs font-semibold text-slate-600 mb-1.5">风险维度</p>
        ${risks.map(d => `<div class="flex items-center justify-between mb-0.5 text-xs">
          <span class="text-slate-600">${d.dimension_name}</span>
          <span class="badge badge-red" style="font-size:0.6rem">${d.completion_rate != null ? d.completion_rate + '%' : '--'}</span>
        </div>`).join('')}
      </div>`
    : '';

  const recommendationsHtml = recommendations.length > 0
    ? `<div>
        <p class="text-xs font-semibold text-slate-600 mb-1.5">建议动作</p>
        ${recommendations.map((r, i) => `<div class="flex items-start gap-1.5 mb-1 text-xs">
          <span class="inline-flex items-center justify-center rounded-full w-4 h-4 text-[0.6rem] font-bold text-white flex-shrink-0 mt-px" style="background:${i === 0 ? '#b05050' : i === 1 ? '#9a7541' : '#8d9aa8'}">${i + 1}</span>
          <span class="text-slate-600"><b>${r.priority}</b>整改 <b>${r.dimName}</b>${r.measureCount > 0 ? ` — 已有 ${r.measureCount} 条关联措施` : ' — 暂无关联措施，建议新增'}</span>
        </div>`).join('')}
      </div>`
    : '<p class="text-xs text-slate-400">所有维度均已达标，继续保持。</p>';

  container.innerHTML = `
    ${scoreHtml}
    <div class="grid grid-cols-2 gap-3 text-xs">
      <div class="rounded-xl border border-slate-100 bg-white/50 p-3">
        ${strengthsHtml || '<p class="text-xs text-slate-400">暂无突出亮点</p>'}
      </div>
      <div class="rounded-xl border border-slate-100 bg-white/50 p-3">
        ${risksHtml || '<p class="text-xs text-slate-400">暂无风险维度</p>'}
      </div>
    </div>
    <div class="mt-3 rounded-xl border border-slate-100 bg-white/50 p-3">
      ${recommendationsHtml}
    </div>`;
}
function measureFormHtml() {
  const dimOpts = Object.entries(state.dimNameMap).map(([id, name]) =>
    `<option value="${id}">${name}</option>`
  ).join('');
  return `
    <div id="measureAddForm" class="mb-4 rounded-2xl border border-indigo-200/60 bg-indigo-50/50 p-4">
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label class="block text-xs text-slate-500 mb-1">措施名称 <span class="text-red-400">*</span></label>
          <input id="mfName" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5" placeholder="输入措施名称">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">关联维度</label>
          <select id="mfDim" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5">${dimOpts}</select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">完成阶段</label>
          <select id="mfPhase" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5">
            <option value="">请选择</option>
            <option value="3个月内">3个月内</option>
            <option value="6个月内">6个月内</option>
            <option value="1年内">1年内</option>
            <option value="1年以上">1年以上</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">预算 (元)</label>
          <input id="mfBudget" type="number" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5" placeholder="例: 75000">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">判断标准</label>
          <input id="mfEffect" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5" placeholder="描述判断标准">
        </div>
        <div class="flex items-end gap-2">
          <button id="btnSubmitMeasure" class="rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 transition">提交</button>
          <button id="btnCancelMeasure" class="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition">取消</button>
        </div>
      </div>
    </div>`;
}

async function renderBuildingMeasures() {
  const container = $('#buildingMeasures');
  try {
    const measures = await fetchBuildingMeasures(state.selectedBuildingId);

    // Store for filtering
    state.buildingMeasuresAll = dedupeMeasures(measures || []);
    state.buildingMeasureFilter = { dim: '', phase: '' };

    renderBuildingMeasuresView();
  } catch (err) {
    console.error('Measures load failed:', err);
    container.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">改进方案数据加载失败</p>';
  }
}

function renderBuildingMeasuresView() {
  const container = $('#buildingMeasures');
  let measures = [...(state.buildingMeasuresAll || [])];
  const filter = state.buildingMeasureFilter || { dim: '', phase: '' };

  // Apply filters
  if (filter.dim) {
    measures = measures.filter(m => {
      const ids = (m.dimension_ids || '').split(',').map(s => s.trim());
      return ids.includes(filter.dim);
    });
  }
  if (filter.phase) {
    measures = measures.filter(m => m.completion_phase === filter.phase);
  }

  // Sort by status priority
  measures.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  // Budget summary
  const totalBudget = measures.reduce((sum, m) => sum + (m.budget || 0), 0);
  const budgetSummary = totalBudget > 0
    ? `<span class="text-xs text-slate-500 ml-4">总预算: <b class="text-slate-700">¥${(totalBudget / 10000).toFixed(1)} 万</b> (${measures.length} 条)</span>`
    : (measures.length > 0 ? `<span class="text-xs text-slate-400 ml-4">共 ${measures.length} 条</span>` : '');

  // Filter bar
  const dims = Object.entries(state.dimNameMap);
  const dimOpts = dims.map(([id, name]) => `<option value="${id}" ${filter.dim === id ? 'selected' : ''}>${name}</option>`).join('');
  const phases = ['3个月内', '6个月内', '1年内', '1年以上'];

  const filterBar = `
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <button id="btnShowMeasureForm" class="rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-50 transition">+ 新建措施</button>
      <span class="text-xs text-slate-400">筛选:</span>
      <select id="bldMeasureDimFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1">
        <option value="">全部维度</option>
        ${dimOpts}
      </select>
      <select id="bldMeasurePhaseFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1">
        <option value="">全部阶段</option>
        ${phases.map(p => `<option value="${p}" ${filter.phase === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      ${budgetSummary}
      <button id="btnExportBldMeasures" class="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 transition">导出 CSV</button>
    </div>`;

  const measuresHtml = measures.length === 0
    ? '<p class="text-sm text-slate-400 py-4 text-center">暂无匹配措施</p>'
    : `<table class="data-table">
        <thead><tr><th>措施</th><th>关联维度</th><th>完成阶段</th><th>预算</th><th>判断标准</th><th>状态</th></tr></thead>
        <tbody>${measures.map(m => `
          <tr>
            <td class="text-xs font-medium max-w-[240px]" title="${(m.description || '').replace(/"/g, '&quot;')}">${m.name || '-'}</td>
            <td class="text-xs"><span class="badge" style="${dimBadgeStyle(m.dimension_ids)}">${dimIdToName(m.dimension_ids)}</span></td>
            <td class="text-xs">${m.completion_phase || '-'}</td>
            <td class="text-xs">${m.budget != null ? '¥' + (m.budget / 10000).toFixed(1) + '万' : '-'}</td>
            <td class="text-xs max-w-[120px]">${m.expected_effect || '-'}</td>
            <td>
              <select class="measure-status-select rounded-lg border-slate-200 text-xs px-1 py-0.5" data-mid="${m.id}" data-bid="${m.building_id}">
                <option value="未开始" ${m.status === '未开始' ? 'selected' : ''}>未开始</option>
                <option value="进行中" ${m.status === '进行中' ? 'selected' : ''}>进行中</option>
                <option value="已完成" ${m.status === '已完成' ? 'selected' : ''}>已完成</option>
                <option value="超期" ${m.status === '超期' ? 'selected' : ''}>超期</option>
              </select>
            </td>
          </tr>`).join('')}</tbody>
      </table>`;

  container.innerHTML = filterBar + measuresHtml;

  // "New measure" button handler
  const addBtn = $('#btnShowMeasureForm');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const form = $('#measureAddForm');
      if (form) { form.remove(); return; }
      addBtn.insertAdjacentHTML('afterend', measureFormHtml());
      bindMeasureFormSubmit();
    });
  }

  // Dimension filter
  const dimFilter = $('#bldMeasureDimFilter');
  if (dimFilter) {
    dimFilter.addEventListener('change', () => {
      state.buildingMeasureFilter.dim = dimFilter.value;
      renderBuildingMeasuresView();
    });
  }

  // Phase filter
  const phaseFilter = $('#bldMeasurePhaseFilter');
  if (phaseFilter) {
    phaseFilter.addEventListener('change', () => {
      state.buildingMeasureFilter.phase = phaseFilter.value;
      renderBuildingMeasuresView();
    });
  }

  // Status change handlers
  container.querySelectorAll('.measure-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const mid = sel.dataset.mid;
      const bid = sel.dataset.bid;
      const newStatus = sel.value;
      try {
        await updateMeasure(bid, mid, { status: newStatus });
        // Update local cache
        const cached = state.buildingMeasuresAll.find(m => m.id == mid);
        if (cached) cached.status = newStatus;
        showToast('状态已更新', 'success');
        renderBuildingMeasuresView();
      } catch (err) {
        showToast('更新失败', 'error');
      }
    });
  });

  // Export button
  const exportBldBtn = $('#btnExportBldMeasures');
  if (exportBldBtn) {
    exportBldBtn.addEventListener('click', () => {
      const measures = [...(state.buildingMeasuresAll || [])];
      const filter = state.buildingMeasureFilter || { dim: '', phase: '' };
      let filtered = measures;
      if (filter.dim) {
        filtered = filtered.filter(m => {
          const ids = (m.dimension_ids || '').split(',').map(s => s.trim());
          return ids.includes(filter.dim);
        });
      }
      if (filter.phase) {
        filtered = filtered.filter(m => m.completion_phase === filter.phase);
      }
      const headers = ['措施', '关联维度', '完成阶段', '预算(元)', '判断标准', '状态'];
      const rows = filtered.map(m => [m.name || '', dimIdToName(m.dimension_ids), m.completion_phase || '', m.budget || '', m.expected_effect || '', m.status || '']);
      downloadCSV(`楼宇_${state.selectedBuildingId}_改进措施.csv`, headers, rows);
      showToast('CSV 已导出', 'success');
    });
  }
}

function bindMeasureFormSubmit() {
  $('#btnSubmitMeasure').addEventListener('click', async () => {
    const name = $('#mfName').value.trim();
    if (!name) { showToast('请输入措施名称', 'error'); return; }
    const data = {
      building_id: state.selectedBuildingId,
      name,
      dimension_ids: $('#mfDim').value || null,
      completion_phase: $('#mfPhase').value || null,
      budget: $('#mfBudget').value ? parseFloat($('#mfBudget').value) : null,
      expected_effect: $('#mfEffect').value.trim() || null
    };
    try {
      await createMeasure(data);
      showToast('措施已创建', 'success');
      await renderBuildingMeasures();
    } catch (err) {
      showToast('创建失败: ' + err.message, 'error');
    }
  });

  $('#btnCancelMeasure').addEventListener('click', () => {
    const form = $('#measureAddForm');
    if (form) form.remove();
  });
}

// ---- Asset / Energy / Cost Modules (Building Level) ----

async function renderAssetModule(buildingId) {
  const container = $('#assetModuleContent');
  if (!container) return;
  try {
    const buildings = await getBuildings();
    const b = buildings.find(x => x.id == buildingId);
    if (!b) { container.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">数据加载失败</p>'; return; }

    // Compute regional averages for comparison
    const regionBlds = buildings.filter(x => x.region === b.region);
    const avg = (arr) => arr.length ? Math.round(arr.reduce((s,v)=>s+v,0)/arr.length) : null;
    const regionAvgHc = avg(regionBlds.map(x=>x.headcount).filter(v=>v!=null));
    const regionAvgFloors = avg(regionBlds.map(x=>x.floors).filter(v=>v!=null));

    const fields = [
      { label: '资产性质', value: b.asset_type || '未填写', highlight: true },
      { label: '工位数', value: b.headcount != null ? b.headcount : '未填写', region: regionAvgHc, suffix: '' },
      { label: '面积(㎡)', value: b.area_sqm != null ? b.area_sqm.toLocaleString() : '未填写' },
      { label: '层数', value: b.floors != null ? b.floors : '未填写', region: regionAvgFloors, suffix: '层' },
      { label: '楼龄(年)', value: b.building_age != null ? b.building_age : '未填写' },
      { label: '门禁数', value: b.access_gates != null ? b.access_gates : '未填写' },
      { label: '供应商', value: b.supplier || '未填写' },
      { label: '业务线', value: b.business_lines || '未填写' },
    ];

    container.innerHTML = `
      <div class="grid grid-cols-2 gap-2 text-xs">
        ${fields.map(f => {
          const valColor = f.value === '未填写' ? 'text-slate-300' : 'text-slate-700';
          const cmpHtml = f.region != null
            ? `<div class="mt-0.5 text-[0.6rem] text-slate-400">区域均值: ${f.region}${f.suffix||''}</div>`
            : '';
          return `<div class="rounded-xl border border-slate-100 bg-white/50 p-2.5">
            <div class="text-slate-400">${f.label}</div>
            <div class="font-semibold mt-0.5 ${valColor}">${f.value}</div>
            ${cmpHtml}
          </div>`;
        }).join('')}
      </div>
      <div class="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>数据来源: 楼宇档案库</span>
        <button onclick="saveBuildingInfo(${b.id})" class="rounded-lg border border-slate-200 px-2 py-0.5 hover:bg-slate-50 transition">编辑</button>
      </div>`;
  } catch (err) {
    container.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">加载失败</p>';
  }
}

function renderEnergyModule(buildingId) {
  const container = $('#energyModuleContent');
  if (!container) return;

  const data = state.buildingIndicatorsData;
  const dims = data ? data.dimensions : [];
  // Energy-relevant dimensions: D16 (温度适宜→HVAC), D11 (节能降耗), D18 (空气清新→通风)
  const energyDims = ['D16', 'D11', 'D18'];
  const related = dims.filter(d => energyDims.includes(d.dimension_id));

  // Score: average of energy-related dimension rates
  const rates = related.map(d => d.completion_rate).filter(r => r != null);
  const energyScore = rates.length ? Math.round(rates.reduce((s,r)=>s+r,0)/rates.length) : null;

  let scoreColor, scoreLabel;
  if (energyScore == null) { scoreColor = '#94a3b8'; scoreLabel = '--'; }
  else if (energyScore >= 80) { scoreColor = '#4a7c5f'; scoreLabel = '优秀'; }
  else if (energyScore >= 60) { scoreColor = '#9a7541'; scoreLabel = '一般'; }
  else { scoreColor = '#b05050'; scoreLabel = '待改善'; }

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <div class="flex flex-col items-center justify-center rounded-2xl px-5 py-3" style="background:${energyScore != null ? (energyScore >= 80 ? '#f0f7f2' : energyScore >= 60 ? '#fef9f0' : '#fef5f5') : '#f8fafc'}">
        <span class="text-2xl font-bold" style="color:${scoreColor}">${energyScore != null ? energyScore : '--'}</span>
        <span class="text-xs font-medium" style="color:${scoreColor}">${scoreLabel}</span>
      </div>
      <div class="flex-1 text-xs text-slate-500">
        <p>能源效率评分基于 <b>温度适宜</b>、<b>节能降耗</b>、<b>空气清新</b> 三项指标综合计算。</p>
      </div>
    </div>
    <div class="space-y-1.5">
      ${related.length ? related.map(d => {
        const rate = d.completion_rate;
        const barColor = rate != null ? (rate >= 80 ? '#4a7c5f' : rate >= 50 ? '#9a7541' : '#b05050') : '#e2e8f0';
        return `<div class="flex items-center gap-2 text-xs">
          <span class="w-16 text-slate-500 truncate">${d.dimension_name}</span>
          <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full" style="width:${rate!=null?rate:0}%;background:${barColor}"></div>
          </div>
          <span class="w-10 text-right font-medium text-slate-600">${rate!=null?rate+'%':'--'}</span>
        </div>`;
      }).join('') : '<p class="text-xs text-slate-400 py-2 text-center">暂无能源相关指标数据</p>'}
    </div>`;
}

function renderCostModule() {
  const container = $('#costModuleContent');
  if (!container) return;

  const measures = state.buildingMeasuresAll || [];
  const totalBudget = measures.reduce((s, m) => s + (m.budget || 0), 0);
  const budgetByDim = {};
  const budgetByPhase = {};
  measures.forEach(m => {
    if (!m.budget) return;
    const dims = (m.dimension_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    dims.forEach(d => {
      budgetByDim[d] = (budgetByDim[d] || 0) + m.budget;
    });
    const phase = m.completion_phase || '未设定';
    budgetByPhase[phase] = (budgetByPhase[phase] || 0) + m.budget;
  });

  const sortedDims = Object.entries(budgetByDim).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const maxDimBudget = sortedDims.length ? Math.max(...sortedDims.map(d=>d[1])) : 1;

  const dimLabels = sortedDims.map(([id]) => dimIdToName(id) || id);
  const dimValues = sortedDims.map(([,v]) => v);

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <div class="flex-1 rounded-xl border border-slate-100 bg-white/50 p-3">
        <div class="text-xs text-slate-400">措施总预算</div>
        <div class="text-xl font-bold text-slate-700">${totalBudget > 0 ? '¥'+(totalBudget/10000).toFixed(1)+' 万' : '--'}</div>
      </div>
      <div class="flex-1 rounded-xl border border-slate-100 bg-white/50 p-3">
        <div class="text-xs text-slate-400">关联措施</div>
        <div class="text-xl font-bold text-slate-700">${measures.length} 条</div>
      </div>
    </div>
    ${sortedDims.length > 0 ? `
      <div class="text-xs text-slate-500 mb-2">预算按维度分布</div>
      <div class="space-y-1 mb-3">
        ${sortedDims.map(([id, budget]) => {
          const pct = Math.round(budget / maxDimBudget * 100);
          return `<div class="flex items-center gap-1.5 text-xs">
            <span class="w-14 truncate text-slate-500">${dimIdToName(id)||id}</span>
            <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full" style="width:${pct}%;background:#6f7bb2"></div>
            </div>
            <span class="w-14 text-right text-slate-600">¥${(budget/10000).toFixed(1)}万</span>
          </div>`;
        }).join('')}
      </div>
    ` : ''}
    ${Object.keys(budgetByPhase).length > 0 ? `
      <div class="text-xs text-slate-500 mb-2">预算按阶段分布</div>
      ${Object.entries(budgetByPhase).map(([phase, budget]) => `
        <div class="flex items-center justify-between text-xs py-0.5">
          <span class="text-slate-500">${phase}</span>
          <span class="font-medium text-slate-600">¥${(budget/10000).toFixed(1)} 万</span>
        </div>`).join('')}
    ` : ''}
    ${measures.length === 0 ? '<p class="text-xs text-slate-400 py-4 text-center">暂无措施数据</p>' : ''}
  `;
}

// ---- Toast Notification ----
function showToast(msg, type) {
  const existing = $('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ---- CSV Export ----
function downloadCSV(filename, headers, rows) {
  const BOM = '﻿';
  const csv = BOM + [headers.join(',')].concat(rows.map(r => r.map(v => {
    const s = (v != null ? String(v) : '');
    return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(','))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportBuildingCSV() {
  const q = (state.buildingSearchQuery || '').toLowerCase().trim();
  let data = state.allBuildingRates || [];
  if (q) {
    data = data.filter(b =>
      (b.name || '').toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q) ||
      (b.region || '').toLowerCase().includes(q)
    );
  }
  const col = state.buildingSortCol || 'overall_rate';
  const dir = state.buildingSortDir === 'desc' ? -1 : 1;
  data.sort((a, b) => {
    const va = a[col], vb = b[col];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb, 'zh');
    return dir * (va - vb);
  });
  const headers = ['楼宇名称', '区域', '城市', '资产性质', '规模分档', '改进措施数', '未达标维度', '综合完成率(H1 2026)', '上期完成率(H2 2025)'];
  const rows = data.map(b => [b.name, b.region, b.city, b.asset_type, b.scale_tier, b.measures_count, b.failing_dim_count, b.overall_rate != null ? b.overall_rate + '%' : '', b.prev_rate != null ? b.prev_rate + '%' : '']);
  downloadCSV('楼宇档案_综合完成率.csv', headers, rows);
  showToast('CSV 已导出', 'success');
}

function exportMeasuresCSV() {
  let measures = [...(state.overviewMeasures || [])];
  const f = state.measureFilter;
  if (f.status) measures = measures.filter(m => m.status === f.status);
  if (f.dim) measures = measures.filter(m => (m.dimension_ids || '').split(',').map(s => s.trim()).includes(f.dim));
  if (f.phase) measures = measures.filter(m => m.completion_phase === f.phase);
  measures.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  const headers = ['楼宇', '区域', '措施名称', '关联维度', '完成阶段', '预算(元)', '判断标准', '状态'];
  const rows = measures.map(m => [m.building_name || '', m.region || '', m.name || '', dimIdToName(m.dimension_ids), m.completion_phase || '', m.budget || '', m.expected_effect || '', m.status || '']);
  downloadCSV('改进措施汇总.csv', headers, rows);
  showToast('CSV 已导出', 'success');
}

window.exportBuildingCSV = exportBuildingCSV;
window.exportMeasuresCSV = exportMeasuresCSV;

// ---- Expose to global scope for inline onclick handlers ----
window.navigateToBuilding = navigateToBuilding;
window.loadBuildingView = loadBuildingView;
window.saveBuildingInfo = saveBuildingInfo;
window.drillKey4Dim = function(dimId, dimName) {
  // Ensure overview data is loaded, then show drill-down
  if (state.overviewData) {
    showDimDrillDown(dimId, dimName);
  } else {
    fetchOverview(getFilterParams()).then(data => {
      state.overviewData = data;
      showDimDrillDown(dimId, dimName);
    });
  }
};

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
