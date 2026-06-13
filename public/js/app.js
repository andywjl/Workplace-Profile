// ============================================================
// Workplace Profile System - Main Application
// ============================================================

// 单楼宇档案默认展示的楼宇（成都桂溪广场）
const DEFAULT_BUILDING_ID = 60;

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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
window.escapeHtml = escapeHtml;

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

// ---- UI Utilities ----

// Sidebar building expand/collapse (via inline onclick)
window.toggleBldSubs = function() {
  const subs = document.getElementById('sidebarBuildingSubs');
  const icon = document.getElementById('buildingExpandIcon');
  if (!subs || !icon) return;
  const isOpen = !subs.classList.contains('hidden');
  subs.classList.toggle('hidden', isOpen);
  icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
};

// openDimPage defined in index.html inline script

// Toggle sidebar region sub-menu
window.toggleSidebarRegion = function(e) {
  e.stopPropagation();
  const subs = document.getElementById('sidebarRegionSubs');
  const icon = document.getElementById('regionExpandIcon');
  if (!subs || !icon) return;
  const isOpen = !subs.classList.contains('hidden');
  subs.classList.toggle('hidden', isOpen);
  icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  // Also navigate to region view
  switchView('region');
};

// Sidebar region sub-item clicks are bound via inline onclick in index.html

// Counter animation: animate number from start to end
function animateCounter(el, start, end, suffix, decimals) {
  const dur = 800;
  const startTime = performance.now();
  suffix = suffix || '';
  decimals = decimals != null ? decimals : (Number.isInteger(end) ? 0 : 1);
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / dur, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = start + (end - start) * eased;
    el.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Logout
window.logout = function() {
  state.user = null;
  state.token = null;
  localStorage.removeItem('auth_token');
  disposeCharts();
  clearCache();
  state.overviewData = null;
  state.buildingIndicatorsData = null;
  // Reset role restrictions
  var filterEl = document.getElementById('filterRegion');
  if (filterEl) { filterEl.value = ''; filterEl.disabled = false; }
  var vendorLinks = document.querySelectorAll('[data-view="vendor"]');
  for (var i = 0; i < vendorLinks.length; i++) { vendorLinks[i].style.display = ''; }
  var saveBtn = document.getElementById('btnSaveIndicators');
  if (saveBtn) saveBtn.style.display = '';
  var badge = document.getElementById('userRoleBadge');
  if (badge) badge.textContent = '';
  // Hide main content, show landing
  ['viewOverview','viewRegion','viewBuilding','viewVendor','viewDimDetail'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
  var landing = document.getElementById('landingPage');
  if (landing) { landing.style.display = ''; landing.style.opacity = '1'; }
  var loading = document.getElementById('loadingScreen');
  if (loading) loading.style.display = 'none';
  var enterBtn = document.getElementById('btnEnterSystem');
  if (enterBtn) enterBtn.classList.add('hidden');
  var loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.style.display = 'flex';
};

// Show login (called by API 401 handler)
window.showLogin = function() {
  var landing = document.getElementById('landingPage');
  if (landing) { landing.style.display = ''; landing.style.opacity = '1'; }
  var modal = document.getElementById('loginModal');
  if (modal) modal.style.display = 'flex';
  var loading = document.getElementById('loadingScreen');
  if (loading) loading.style.display = 'none';
  ['viewOverview','viewRegion','viewBuilding','viewVendor','viewDimDetail'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
};

// Collapsible sidebar
window.toggleSidebar = function() {
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('sidebarCollapseBtn');
  if (!sb || !btn) return;
  var collapsed = sb.classList.toggle('collapsed');
  btn.textContent = collapsed ? '▶' : '◀';
  document.documentElement.style.setProperty('--sidebar-w', collapsed ? 'var(--sidebar-collapsed-w)' : '240px');
  // Resize charts after transition
  setTimeout(() => {
    Object.values(window._chartInstances || chartInstances || {}).forEach(c => {
      try { c.resize(); } catch(e) {}
    });
  }, 350);
};


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
    // Populate supplier filter
    try {
      const blds = await getBuildings();
      const suppliers = [...new Set(blds.map(b => b.supplier).filter(Boolean))].sort();
      const sel = $('#filterSupplier');
      if (sel) suppliers.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
    } catch(e) {}

    updateHint('正在加载维度数据...');
    try {
      const dims = await getDimensions();
      dims.forEach(d => { state.dimNameMap[d.id] = d.name; });
    } catch (e) {
      console.error('Failed to preload dimensions:', e);
    }

    updateHint('正在加载全国总览...');
    // logout() hides all view panels, so go through switchView to restore visibility
    await switchView('overview');

    // Fade out loading
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }

    // Show user role badge
    if (state.user) {
      var badge = document.getElementById('userRoleBadge');
      if (badge) {
        var roleNames = { admin: '超级管理员', leadership: '行政管理', regional: '区域负责人', building: '楼长', poc: '专项POC', visitor: '访客' };
        var roleColors = { admin: '#dc2626', leadership: '#3b82f6', regional: '#8b5cf6', building: '#059669', poc: '#d97706', visitor: '#94a3b8' };
        badge.textContent = state.user.display_name + ' (' + (roleNames[state.user.role] || state.user.role) + ')';
        badge.style.color = roleColors[state.user.role] || '#94a3b8';
      }
      // Data scope: regional user locked to their region
      if (state.user.role === 'regional' && state.user.scopes) {
        var regionScope = state.user.scopes.find(function(s) { return s.scope_type === 'region'; });
        if (regionScope) {
          var filterEl = document.getElementById('filterRegion');
          if (filterEl) { filterEl.value = regionScope.scope_value; filterEl.disabled = true; }
        }
      }
      // Hide vendor sidebar for non-admin/leadership
      var vendorLinks = document.querySelectorAll('[data-view="vendor"]');
      for (var i = 0; i < vendorLinks.length; i++) {
        if (!window.canViewVendor()) vendorLinks[i].style.display = 'none';
      }
      // Hide save/edit buttons for visitors
      if (state.user.role === 'visitor' || state.user.role === 'leadership') {
        var saveBtn = document.getElementById('btnSaveIndicators');
        if (saveBtn) saveBtn.style.display = 'none';
      }
    }
  };

  // ---- Permission helpers ----
  window.canEdit = function() {
    if (!state.user) return false;
    return state.user.role === 'admin' || state.user.role === 'building';
  };
  window.canEditAny = function() {
    return state.user && state.user.role === 'admin';
  };
  window.canViewVendor = function() {
    return state.user && (state.user.role === 'admin' || state.user.role === 'leadership');
  };

  // ---- "登录后进入" button (only shown after login) ----
  const btnEnter = document.getElementById('btnEnterSystem');
  if (btnEnter) {
    btnEnter.addEventListener('click', () => {
      if (loginModal) loginModal.style.display = 'none';
      startApp(state.user ? state.user.display_name : null);
    });
  }

  // ---- Login modal (show immediately) ----
  if (loginModal) loginModal.style.display = 'flex';
  const btnShowLogin = document.getElementById('btnShowLogin');
  const btnCloseLogin = document.getElementById('btnCloseLogin');
  const btnLogin = document.getElementById('btnLogin');

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

  // One-click demo login: always enter as the default admin account
  const doLogin = async () => {
    try {
      const res = await apiPost('/api/login', { account: 'admin' });
      if (res.ok) {
        state.user = res.user;
        state.token = res.token;
        localStorage.setItem('auth_token', res.token);
        if (loginModal) loginModal.style.display = 'none';
        startApp(res.user.display_name || res.user.username);
      } else {
        showToast(res.error || '登录失败', 'error');
      }
    } catch (err) {
      showToast('登录验证失败，请检查网络', 'error');
    }
  };

  if (btnLogin) btnLogin.addEventListener('click', doLogin);

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
  $$('.sidebar-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  state.currentView = view;
  $$('.sidebar-nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  // Show/hide building search in sidebar
  const searchArea = document.getElementById('sidebarBuildingArea');
  if (searchArea) searchArea.classList.toggle('hidden', view !== 'building');

  $('#viewOverview').classList.toggle('hidden', view !== 'overview');
  $('#viewRegion').classList.toggle('hidden', view !== 'region');
  $('#viewBuilding').classList.toggle('hidden', view !== 'building');
  $('#viewVendor').classList.toggle('hidden', view !== 'vendor');
  if (view !== 'dimension') { $('#viewDimDetail').classList.add('hidden'); }
  else {
    $('#viewOverview').classList.add('hidden');
    $('#viewRegion').classList.add('hidden');
    $('#viewBuilding').classList.add('hidden');
    $('#viewVendor').classList.add('hidden');
  }

  updateBreadcrumb();
  disposeCharts();

  // Scroll to top of content
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (view === 'overview') return loadOverview();
  else if (view === 'region') return loadRegionView();
  if (view === 'building') {
    if (!state.selectedBuildingId) {
      // 默认展示成都桂溪广场（id=60），不存在时回退到列表首个
      return getBuildings().then(function(list) {
        var def = (list || []).find(function(b) { return b.id === DEFAULT_BUILDING_ID; });
        state.selectedBuildingId = def ? def.id : ((list && list.length) ? list[0].id : DEFAULT_BUILDING_ID);
        return loadBuildingView(state.selectedBuildingId);
      }).catch(function() { state.selectedBuildingId = DEFAULT_BUILDING_ID; return loadBuildingView(DEFAULT_BUILDING_ID); });
    }
    return loadBuildingView(state.selectedBuildingId);
  }
  if (view === 'vendor') loadVendorView();
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
    else if (state.currentView === 'building') applyFiltersToBuildingView();
  });
  $('#filterAsset').addEventListener('change', () => {
    if (state.currentView === 'overview') loadOverview();
    else if (state.currentView === 'region') loadRegionView();
    else if (state.currentView === 'building') applyFiltersToBuildingView();
  });
  $('#filterSupplier').addEventListener('change', () => {
    if (state.currentView === 'overview') loadOverview();
    else if (state.currentView === 'region') loadRegionView();
    else if (state.currentView === 'building') applyFiltersToBuildingView();
  });
  $('#filterPeriod').addEventListener('change', () => {
    state.currentPeriod = $('#filterPeriod').value;
    state.prevPeriod = 'H2_2025';
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

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Cmd+K / Ctrl+K: Open search palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const palette = document.getElementById('cmdPalette');
      if (palette && palette.style.display === 'flex') {
        closeCmdPalette();
      } else {
        openCmdPalette();
      }
      return;
    }
    // Escape: close drill modal or cmd palette
    if (e.key === 'Escape') {
      const palette = document.getElementById('cmdPalette');
      if (palette && palette.style.display === 'flex') {
        closeCmdPalette();
        return;
      }
      if (modal && !modal.classList.contains('hidden')) {
        closeDimDrillDown();
      }
    }
  });

  // Cmd palette input handler
  const cmdInput = document.getElementById('cmdPaletteInput');
  if (cmdInput) {
    cmdInput.addEventListener('input', () => renderCmdResults(cmdInput.value));
    initCmdData();
  }
}

function getFilterParams() {
  return {
    region: $('#filterRegion').value,
    asset_type: $('#filterAsset').value,
    supplier: $('#filterSupplier').value,
    period: state.currentPeriod,
    prev_period: state.prevPeriod
  };
}

// Filter helper: does a building match active filters?
function buildingMatchesActiveFilters(b) {
  if (!b) return false;
  var region = $('#filterRegion').value;
  var asset = $('#filterAsset').value;
  var supplier = $('#filterSupplier').value;
  if (region && b.region !== region) return false;
  if (asset && b.asset_type !== asset) return false;
  if (supplier && b.supplier !== supplier) return false;
  return true;
}

// Back-fill filter dropdowns to reflect currently selected building
function syncFiltersToBuilding(bld) {
  if (!bld) return;
  var rf = $('#filterRegion');
  if (rf && !rf.disabled && bld.region) rf.value = bld.region;
  var af = $('#filterAsset');
  if (af && bld.asset_type) af.value = bld.asset_type;
  var sf = $('#filterSupplier');
  if (sf) {
    var found = false;
    for (var i = 0; i < sf.options.length; i++) { if (sf.options[i].value === bld.supplier) { found = true; break; } }
    sf.value = found ? bld.supplier : '';
  }
}

// Apply filters in building view: switch to first matching building if current doesn't match
async function applyFiltersToBuildingView() {
  try {
    var buildings = await getBuildings();
    var cur = buildings.find(function(b) { return b.id == state.selectedBuildingId; });
    if (cur && buildingMatchesActiveFilters(cur)) {
      if (setupBuildingSelect._renderFiltered) setupBuildingSelect._renderFiltered();
      return;
    }
    var matches = buildings.filter(buildingMatchesActiveFilters);
    if (matches.length > 0) {
      loadBuildingView(matches[0].id);
    } else {
      showToast('没有符合当前筛选条件的楼宇', 'error');
      if (setupBuildingSelect._renderFiltered) setupBuildingSelect._renderFiltered();
    }
  } catch (e) { console.error('applyFiltersToBuildingView failed:', e); }
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
    // Map to radar-compatible field names
    const radarH1 = (data.dimension_rates || []).map(d => ({ ...d, dimension_name: d.name }));
    const radarH2 = (data.prev_dimension_rates || []).map(d => ({ ...d, dimension_name: d.name }));
    renderRadarChart('chartRadarOverview', radarH1, radarH2);
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
    generateSummaryBanner(data);
    // Apply staggered entrance
    applyStaggeredEntrance('#viewOverview');
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
    { label: '职场总数', value: data.total_buildings, sub: `自持园区 ${data.self_built} / 租赁职场 ${data.leased}`, suffix: '', spark: 'totalBuildings' },
    { label: '综合达标率', value: data.overall_rate != null ? data.overall_rate : '--', suffix: '%', isPct: true, sub: trendSub, subColor: `color:${trendColor === 'green' ? '#059669' : trendColor === 'rose' ? '#dc2626' : '#94a3b8'}` },
    { label: '改进措施数', value: (data.measure_stats || []).reduce((s, m) => s + m.cnt, 0), suffix: '', sub: `未开始 ${(data.measure_stats||[]).filter(m=>m.status==='未开始').reduce((s,m)=>s+m.cnt,0)} / 进行中 ${(data.measure_stats||[]).filter(m=>m.status==='进行中').reduce((s,m)=>s+m.cnt,0)}` },
    { label: '数据填报率', value: data.fill_rate, suffix: '%', isPct: true, sub: `${data.filled_values} / ${data.total_possible}` },
    { label: '未达标楼宇', value: data.not_passing_count, suffix: '', sub: data.total_buildings > 0 ? `占比 ${Math.round(data.not_passing_count / data.total_buildings * 100)}%` : '' },
  ];

  container.innerHTML = cards.map((c, i) => {
    const subColor = c.subColor || '';
    const valColor = c.subColor ? c.subColor.replace('color:', '') : '';
    const valId = `kpi-val-${containerId}-${i}`;
    return `
    <div class="kpi-card stagger-${i+1}">
      <div class="kpi-value" id="${valId}">${c.isPct ? c.value + '%' : c.value}</div>
      <div class="kpi-label">${c.label}</div>
      ${c.sub ? `<div class="kpi-sub" style="${subColor}">${c.sub}</div>` : ''}
      <div class="kpi-sparkline" id="spark-${containerId}-${i}"></div>
    </div>`;
  }).join('');

  // Render sparklines for each KPI card
  setTimeout(() => {
    cards.forEach((c, i) => {
      const sparkDom = document.getElementById(`spark-${containerId}-${i}`);
      if (!sparkDom) return;
      renderKpiSparkline(sparkDom, containerId === 'kpiCards' ? data : null, i);
    });
  }, 100);
}

// ---- KPI Sparkline (tiny inline chart) ----
function renderKpiSparkline(dom, data, index) {
  if (!dom) return;
  // Generate synthetic sparkline data based on the metric
  let points = [];
  const seed = index * 7 + 3;
  const base = 50 + (seed % 30);
  const amp = 8 + (seed % 12);
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    points.push(base + Math.sin(t * Math.PI * 2 + seed) * amp + (t - 0.5) * 10 + (Math.random() - 0.5) * 4);
  }
  const w = dom.clientWidth || 140;
  const h = 28;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xStep = (w - pad * 2) / (points.length - 1);

  let pathD = points.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Gradient area fill
  dom.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
      <defs>
        <linearGradient id="sparkGrad${index}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${pathD} L${pad + (points.length-1)*xStep},${h-pad} L${pad},${h-pad} Z" fill="url(#sparkGrad${index})"/>
      <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pad + (points.length-1)*xStep}" cy="${pad + (1-(points[points.length-1]-min)/range)*(h-pad*2)}" r="2.5" fill="#3b82f6" stroke="#fff" stroke-width="1"/>
    </svg>`;
}

// ---- Building Tags ----
const TAG_PRESETS = ['重点关注', '标杆楼宇', '整改中', '新入驻', '待评估', '优秀'];
const TAG_COLORS = {
  '重点关注': '#fef2f2|#dc2626|#fecaca',
  '标杆楼宇': '#ecfdf5|#059669|#a7f3d0',
  '整改中': '#fffbeb|#d97706|#fde68a',
  '新入驻': '#eff6ff|#3b82f6|#bfdbfe',
  '待评估': '#f8fafc|#64748b|#e2e8f0',
  '优秀': '#f0fdf4|#16a34a|#bbf7d0',
};

function getBuildingTags() {
  try { return JSON.parse(localStorage.getItem('bldTags') || '{}'); } catch(e) { return {}; }
}
function setBuildingTags(tags) { localStorage.setItem('bldTags', JSON.stringify(tags)); }
window.addBuildingTag = function(bldId, tag) {
  const tags = getBuildingTags();
  if (!tags[bldId]) tags[bldId] = [];
  if (!tags[bldId].includes(tag)) tags[bldId].push(tag);
  setBuildingTags(tags);
  renderBuildingTags(bldId);
};
window.removeBuildingTag = function(bldId, tag) {
  const tags = getBuildingTags();
  if (tags[bldId]) tags[bldId] = tags[bldId].filter(t => t !== tag);
  setBuildingTags(tags);
  renderBuildingTags(bldId);
};
function renderBuildingTags(bldId) {
  const container = document.getElementById('bldTagContainer');
  if (!container) return;
  const tags = getBuildingTags();
  const bldTags = tags[bldId] || [];
  container.innerHTML = bldTags.map(t => {
    const [bg, color, border] = (TAG_COLORS[t] || '#f8fafc|#64748b|#e2e8f0').split('|');
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-medium cursor-pointer" style="background:${bg};color:${color};border:1px solid ${border}" title="点击移除" onclick="removeBuildingTag(${bldId},'${t}')">${t} ×</span>`;
  }).join('') + `
    <select class="text-[0.65rem] rounded-full px-1.5 py-0.5 border border-slate-200 bg-white text-slate-500 cursor-pointer" onchange="addBuildingTag(${bldId},this.value);this.value=''" style="max-width:80px">
      <option value="">+标签</option>
      ${TAG_PRESETS.filter(t => !bldTags.includes(t)).map(t => `<option value="${t}">${t}</option>`).join('')}
    </select>`;
}

// ---- Cmd+K Search Palette ----
let cmdAllData = [];
function openCmdPalette() {
  const palette = document.getElementById('cmdPalette');
  const input = document.getElementById('cmdPaletteInput');
  if (!palette || !input) return;
  palette.classList.remove('hidden');
  palette.style.display = 'flex';
  input.value = '';
  input.focus();
  renderCmdResults('');
}
window.closeCmdPalette = function() {
  const palette = document.getElementById('cmdPalette');
  if (palette) { palette.style.display = 'none'; palette.classList.add('hidden'); }
};
async function initCmdData() {
  try {
    const [blds, dims] = await Promise.all([getBuildings(), getDimensions()]);
    cmdAllData = [
      ...blds.map(b => ({ type: '楼宇', name: b.name, sub: `${b.region} · ${b.city}`, action: () => { state.selectedBuildingId = b.id; switchView('building'); closeCmdPalette(); } })),
      ...dims.map(d => ({ type: '维度', name: d.name, sub: d.id, action: () => { showDimDrillDown(d.id, d.name); closeCmdPalette(); } })),
    ];
  } catch(e) {}
}
function renderCmdResults(query) {
  const container = document.getElementById('cmdPaletteResults');
  if (!container) return;
  const q = query.toLowerCase().trim();
  let results = q ? cmdAllData.filter(d => d.name.toLowerCase().includes(q) || d.sub.toLowerCase().includes(q)).slice(0, 20) : cmdAllData.slice(0, 12);
  if (results.length === 0) {
    container.innerHTML = '<div class="px-4 py-6 text-center text-sm text-slate-400">未找到匹配结果</div>';
  } else {
    container.innerHTML = results.map((r, i) => `
      <div class="cmd-result flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition text-sm ${i===0?'bg-blue-50':''}" data-idx="${i}" onclick="this.querySelector('.cmd-action-btn').click()">
        <div class="flex items-center gap-3">
          <span class="w-7 h-7 rounded-lg flex items-center justify-center text-[0.6rem] font-semibold ${r.type==='楼宇'?'bg-blue-50 text-blue-600':'bg-purple-50 text-purple-600'}">${r.type[0]}</span>
          <div><div class="text-slate-700">${r.name}</div><div class="text-[0.65rem] text-slate-400">${r.sub}</div></div>
        </div>
        <button class="cmd-action-btn hidden" onclick="arguments[0].stopPropagation()">→</button>
      </div>`).join('');
    container.querySelectorAll('.cmd-result').forEach(el => {
      el.addEventListener('click', () => { const r = results[parseInt(el.dataset.idx)]; if (r && r.action) r.action(); });
    });
  }
}

// ---- Building Compare ----
window.compareList = [];
window.addToCompare = async function(bldId) {
  if (window.compareList.includes(bldId)) { showToast('已在对比列表中', 'error'); return; }
  if (window.compareList.length >= 3) { window.compareList.shift(); }
  window.compareList.push(bldId);
  showToast(`已加入对比 (${window.compareList.length}/3)`, 'success');
  if (window.compareList.length >= 2) renderComparePanel();
};
window.closeCompare = function() {
  document.getElementById('comparePanel').classList.add('hidden');
  window.compareList = [];
};
window.refreshCompare = function() { if (window.compareList.length >= 2) renderComparePanel(); };
async function renderComparePanel() {
  const panel = document.getElementById('comparePanel');
  const content = document.getElementById('compareContent');
  const names = document.getElementById('compareNames');
  if (!panel || !content) return;
  panel.classList.remove('hidden');
  try {
    const blds = await getBuildings();
    const selected = blds.filter(b => window.compareList.includes(b.id));
    if (names) names.textContent = selected.map(b => b.name).join('  vs  ');
    const indicatorsData = await Promise.all(selected.map(b => fetchBuildingIndicators(b.id, state.currentPeriod)));
    const dims = (indicatorsData[0] && indicatorsData[0].dimensions) ? indicatorsData[0].dimensions.map(d => d.dimension_name) : [];
    const rates = indicatorsData.map(data => (data.dimensions || []).map(d => d.completion_rate));

    content.innerHTML = `<table class="data-table">
      <thead><tr><th>维度</th>${selected.map(b => `<th>${b.name}</th>`).join('')}<th>差异</th></tr></thead>
      <tbody>${dims.map((dim, i) => {
        const vals = rates.map(r => r[i]);
        const diff = vals.length >= 2 ? Math.abs(vals[0] - vals[1]) : 0;
        return `<tr><td class="font-medium">${dim}</td>${vals.map(v => `<td><span class="badge ${v>=90?'badge-green':v>=70?'badge-amber':'badge-red'}">${v!=null?v+'%':'--'}</span></td>`).join('')}<td class="text-xs text-slate-400">${diff.toFixed(1)}%</td></tr>`;
      }).join('')}</tbody></table>`;
  } catch(e) { console.error('Compare failed:', e); }
}

// ---- Measure Gantt Chart ----
function renderMeasuresGantt(containerId, measures) {
  const container = document.getElementById(containerId);
  if (!container || !measures.length) return;

  const now = new Date();
  const startMonth = 0; // January
  const endMonth = 11; // December
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const totalMonths = 12;
  const colW = Math.max(40, (700 / totalMonths));

  // Filter measures with dates for timeline display
  const withDates = measures.filter(m => m.planned_end_date).slice(0, 30);
  if (withDates.length === 0) {
    // Fallback: show all measures as status bars
    const phases = ['未开始','进行中','已完成'];
    const colors = { '未开始':'#e2e8f0','进行中':'#3b82f6','已完成':'#059669' };
    let h = '<div style="font-size:0.7rem;overflow-x:auto"><div style="display:flex;min-width:600px">';
    h += '<div style="flex:0 0 180px;font-weight:600;padding:6px 8px;border-bottom:2px solid #e2e8f0">措施名称</div>';
    h += '<div style="flex:1;font-weight:600;padding:6px 8px;border-bottom:2px solid #e2e8f0;color:#94a3b8">状态</div></div>';
    measures.slice(0,30).forEach(m => {
      const idx = phases.indexOf(m.status);
      h += '<div style="display:flex;min-width:600px;align-items:center;padding:2px 0;border-bottom:1px solid #f1f5f9;font-size:0.7rem">' +
        '<div style="flex:0 0 180px;padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(m.name||'-')+'</div>' +
        '<div style="flex:1;padding:4px"><div style="width:'+((idx+1)*25)+'%;height:18px;border-radius:4px;background:'+(colors[m.status]||'#e2e8f0')+';text-align:center;line-height:18px;color:#fff;font-size:0.6rem;min-width:40px">'+m.status+'</div></div></div>';
    });
    h += '</div>';
    container.innerHTML = h;
    return;
  }

  // Timeline-based Gantt
  let html = '<div style="font-size:0.65rem;overflow-x:auto"><div style="display:flex;min-width:' + (180 + totalMonths * colW) + 'px">';
  html += '<div style="flex:0 0 180px;font-weight:600;padding:6px 8px;border-bottom:2px solid #e2e8f0;white-space:nowrap">措施名称</div>';
  const todayMonth = now.getMonth();
  months.forEach((m, i) => {
    const isCurrent = i === todayMonth;
    html += '<div style="width:' + colW + 'px;text-align:center;font-weight:600;padding:6px 2px;border-bottom:2px solid #e2e8f0;color:' + (isCurrent ? '#3b82f6' : '#94a3b8') + '">' + m + '</div>';
  });
  html += '</div>';

  // Today marker line
  html += '<div style="position:relative;min-width:' + (180 + totalMonths * colW) + 'px">';
  html += '<div style="position:absolute;left:' + (180 + todayMonth * colW + colW/2) + 'px;top:0;bottom:0;width:2px;background:#ef4444;z-index:2;opacity:0.5"></div>';

  withDates.forEach(m => {
    const planDate = new Date(m.planned_end_date);
    const planMonth = planDate.getMonth() + (planDate.getFullYear() - now.getFullYear()) * 12;
    const barStart = todayMonth;
    const barEnd = Math.max(todayMonth + 1, planMonth);
    const barW = (barEnd - barStart) * colW;
    const barLeft = 180 + barStart * colW;

    const isOverdue = m.status !== '已完成' && planDate < now;
    const barColor = m.status === '已完成' ? '#22c55e' : isOverdue ? '#ef4444' : '#3b82f6';
    const textColor = '#fff';

    html += '<div style="display:flex;min-width:' + (180 + totalMonths * colW) + 'px;align-items:center;padding:3px 0;border-bottom:1px solid #f1f5f9;position:relative">' +
      '<div style="flex:0 0 180px;padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.65rem" title="' + (m.name||'').replace(/"/g,'&quot;') + '">' + (m.name||'-') + '</div>' +
      '<div style="position:relative;height:22px;flex:1">' +
        '<div style="position:absolute;left:' + barLeft + 'px;width:' + Math.max(barW, 30) + 'px;height:18px;border-radius:4px;background:' + barColor + ';line-height:18px;color:' + textColor + ';text-align:center;font-size:0.6rem;overflow:hidden;white-space:nowrap">' +
          m.planned_end_date + (isOverdue ? ' ⚠' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}

// ---- Effect Validation (Before/After) ----
window.toggleEffectValidation = async function() {
  const section = document.getElementById('effectValidationSection');
  if (!section) return;
  if (!section.classList.contains('hidden')) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  section.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">正在分析指标变化...</p>';

  try {
    // Fetch H2_2025 data for comparison
    const h2Data = await fetchBuildingIndicators(state.selectedBuildingId, 'H2_2025');
    const h1Data = state.buildingIndicatorsData;
    const measures = state.buildingMeasuresAll || [];

    if (!h1Data || !h2Data) {
      section.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">暂无历史数据可供对比</p>';
      return;
    }

    const h1Dims = {};
    const h2Dims = {};
    (h1Data.dimensions || []).forEach(d => { h1Dims[d.dimension_id] = d.completion_rate; });
    (h2Data.dimensions || []).forEach(d => { h2Dims[d.dimension_id] = d.completion_rate; });

    // For each measure, compare linked dimensions Before vs After
    const comparisons = [];
    measures.forEach(m => {
      const dims = (m.dimension_ids || '').split(',').map(s => s.trim()).filter(Boolean);
      dims.forEach(dimId => {
        if (!comparisons.find(c => c.measureId === m.id && c.dimId === dimId)) {
          comparisons.push({
            measureName: m.name || '-',
            measureId: m.id,
            dimId: dimId,
            dimName: state.dimNameMap[dimId] || dimId,
            before: h2Dims[dimId] != null ? h2Dims[dimId] : null,
            after: h1Dims[dimId] != null ? h1Dims[dimId] : null,
            status: m.status,
            initiator: m.initiator || '字节'
          });
        }
      });
    });

    if (comparisons.length === 0) {
      section.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">措施未关联维度，无法对比</p>';
      return;
    }

    // Stats
    let improved = 0, declined = 0, unchanged = 0;
    const validComparisons = comparisons.filter(c => c.before != null && c.after != null);
    validComparisons.forEach(c => {
      const delta = c.after - c.before;
      if (delta > 3) improved++;
      else if (delta < -3) declined++;
      else unchanged++;
    });

    const avgImprovement = validComparisons.length > 0
      ? (validComparisons.reduce((s,c) => s + (c.after - c.before), 0) / validComparisons.length).toFixed(1)
      : '—';

    section.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-slate-700">📈 措施效果验证 (Before/After)</h4>
        <span class="text-xs text-slate-400">H2 2025 → H1 2026</span>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4">
        <div class="rounded-xl bg-white p-3 text-center">
          <div class="text-lg font-bold text-green-600">${improved}</div>
          <div class="text-[0.6rem] text-slate-400">改善 ↑</div>
        </div>
        <div class="rounded-xl bg-white p-3 text-center">
          <div class="text-lg font-bold text-red-600">${declined}</div>
          <div class="text-[0.6rem] text-slate-400">下降 ↓</div>
        </div>
        <div class="rounded-xl bg-white p-3 text-center">
          <div class="text-lg font-bold text-slate-600">${unchanged}</div>
          <div class="text-[0.6rem] text-slate-400">持平 →</div>
        </div>
        <div class="rounded-xl bg-white p-3 text-center">
          <div class="text-lg font-bold" style="color:${parseFloat(avgImprovement) >= 0 ? '#059669' : '#dc2626'}">${avgImprovement}%</div>
          <div class="text-[0.6rem] text-slate-400">平均变化</div>
        </div>
      </div>
      <div class="frozen-pane" style="max-height:360px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px">
      <table class="data-table">
        <thead><tr><th>措施</th><th>维度</th><th>H2 2025</th><th>H1 2026</th><th>变化</th><th>判断</th></tr></thead>
        <tbody>${comparisons.map(c => {
          const delta = c.before != null && c.after != null ? (c.after - c.before) : null;
          const deltaStr = delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(1) + '%' : '—';
          const deltaColor = delta != null ? (delta > 3 ? '#059669' : delta < -3 ? '#dc2626' : '#94a3b8') : '#94a3b8';
          const verdict = delta != null ? (delta > 10 ? '✅ 显著改善' : delta > 3 ? '👍 改善' : delta < -3 ? '⚠️ 下降' : '→ 持平') : '无数据';
          return '<tr>' +
            '<td class="text-xs max-w-[160px] truncate" title="' + (c.measureName||'').replace(/"/g,'&quot;') + '">' + (c.measureName||'-') + '</td>' +
            '<td class="text-xs"><span class="dim-color-bar" style="background:' + (DIM_COLORS[c.dimId] || '#8d9aa8') + '"></span>' + c.dimName + '</td>' +
            '<td class="text-xs">' + (c.before != null ? c.before + '%' : '—') + '</td>' +
            '<td class="text-xs font-semibold">' + (c.after != null ? c.after + '%' : '—') + '</td>' +
            '<td style="color:' + deltaColor + ';font-weight:600;font-size:0.75rem">' + deltaStr + '</td>' +
            '<td class="text-xs" style="color:' + deltaColor + '">' + verdict + '</td>' +
          '</tr>';
        }).join('')}</tbody></table></div>`;
  } catch(e) {
    section.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">分析失败: ' + e.message + '</p>';
  }
};

// ---- Gantt Toggle for Building Measures ----
window.toggleBldMeasuresGantt = function() {
  const container = document.getElementById('ganttChartContainer');
  if (container) {
    container.remove();
    return;
  }
  const measuresSection = document.getElementById('buildingMeasures');
  if (!measuresSection) return;
  const ganttDiv = document.createElement('div');
  ganttDiv.id = 'ganttChartContainer';
  ganttDiv.className = 'mt-3 p-3 bg-white rounded-xl border border-slate-200';
  ganttDiv.innerHTML = '<h4 class="text-xs font-semibold text-slate-700 mb-2">措施时间线甘特图</h4><div id="ganttChart"></div>';
  measuresSection.appendChild(ganttDiv);
  renderMeasuresGantt('ganttChart', state.buildingMeasuresAll || []);
};

// ---- PDF Export ----
window.exportPDF = function() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  const title = state.currentView === 'overview' ? '全国总览' : state.currentView === 'region' ? '区域分析' : '单楼宇档案';
  const content = document.querySelector('#chinaPage .flex-1') || document.querySelector('#viewOverview');
  // Canvas pixels don't survive innerHTML copy, so swap each ECharts container for an image snapshot
  let html = '';
  if (content) {
    const clone = content.cloneNode(true);
    Object.keys(chartInstances).forEach(domId => {
      const target = clone.querySelector('#' + domId);
      if (!target) return;
      try {
        const img = document.createElement('img');
        img.src = chartInstances[domId].getDataURL({ pixelRatio: 2, backgroundColor: '#fff' });
        img.style.width = '100%';
        target.innerHTML = '';
        target.appendChild(img);
      } catch (e) { /* chart disposed or not rendered yet */ }
    });
    html = clone.innerHTML;
  }
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Workplace Profile - ${title}</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link rel="stylesheet" href="${window.location.origin}/css/style.css">
    <style>body{font-family:Inter,sans-serif;padding:30px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>${html}</body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
};

// ---- Summary Banner ----
function generateSummaryBanner(data) {
  const banner = $('#summaryBanner');
  const text = $('#summaryBannerText');
  if (!banner || !text) return;

  const regions = ['京区', '北区', '东区', '西区', '南区'];
  const regionRates = regions.map(r => {
    const blds = (data.building_rates || []).filter(b => b.region === r);
    const rates = blds.map(b => b.overall_rate).filter(v => v != null);
    const avg = rates.length > 0 ? Math.round(rates.reduce((s,v)=>s+v,0)/rates.length) : null;
    return { region: r, avg };
  }).filter(r => r.avg != null);

  const best = regionRates.reduce((a,b) => (a.avg > b.avg ? a : b), regionRates[0]);
  const worst = regionRates.reduce((a,b) => (a.avg < b.avg ? a : b), regionRates[0]);

  let msg = `📊 全国 ${data.total_buildings} 栋楼宇综合达标率 <b>${data.overall_rate}%</b>`;
  if (best && worst && best.region !== worst.region) {
    msg += ` · <b style="color:#059669">${best.region}</b> 最高（${best.avg}%）`;
    msg += ` · <b style="color:#dc2626">${worst.region}</b> 偏低（${worst.avg}%）`;
  }
  if (data.not_passing_count > 0) {
    msg += ` · ${data.not_passing_count} 栋未达标`;
  }
  text.innerHTML = msg;
  banner.classList.remove('hidden');
}

// ---- Staggered entrance helper ----
function applyStaggeredEntrance(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const cards = container.querySelectorAll('.content-card, .kpi-card');
  cards.forEach((card, i) => {
    card.style.animation = 'none';
    card.offsetHeight; // force reflow
    card.style.animation = `staggerIn 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.04}s both`;
  });
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
  // Highlight active region sub-item in sidebar
  document.querySelectorAll('.sidebar-region-sub').forEach(b => {
    b.classList.toggle('active', b.dataset.region === region);
  });
  // Ensure region sub-menu is expanded
  const subs = document.getElementById('sidebarRegionSubs');
  if (subs) subs.classList.remove('hidden');
  const icon = document.getElementById('regionExpandIcon');
  if (icon) icon.style.transform = 'rotate(90deg)';
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
      <td><a onclick="navigateToBuilding(${b.building_id})">${b.name || '-'}</a> <button onclick="event.stopPropagation();addToCompare(${b.building_id})" class="text-[0.6rem] text-slate-300 hover:text-blue-500 ml-1" title="加入对比">⊕</button></td>
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
        <td>${b.supplier || '-'}</td>
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
        ${th('供应商', 'supplier')}
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
      // Highlight sidebar sub-item
      document.querySelectorAll('.sidebar-region-sub').forEach(b => {
        b.classList.toggle('active', b.dataset.region === tag.dataset.region);
      });
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
    const data = await fetchRegion(regionId, {
      asset_type: $('#filterAsset').value,
      supplier: $('#filterSupplier').value,
      period: state.currentPeriod,
      prev_period: state.prevPeriod
    });
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
        <td><a onclick="navigateToBuilding(${b.building_id})">${b.name}</a> <button onclick="event.stopPropagation();addToCompare(${b.building_id})" class="text-[0.6rem] text-slate-300 hover:text-blue-500 ml-1" title="加入对比">⊕</button></td>
        <td>${b.city || '-'}</td>
        <td>${b.asset_type || '-'}</td>
        <td>${b.supplier || '-'}</td>
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
        ${th('供应商', 'supplier')}
        ${th('改进措施', 'measures_count', 'text-right')}
        ${th('未达标维度', 'failing_dim_count', 'text-right')}
        ${th('综合完成率', 'overall_rate')}
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="text-center text-slate-400 py-8">暂无数据</td></tr>'}</tbody>
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
  return switchView('building');
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
    // Render radar chart + portrait (static DOM, always visible)
    updateRadarChart(state.selectedBuildingId);
    // Pre-load measures data
    try {
      const measures = await fetchBuildingMeasures(state.selectedBuildingId);
      state.buildingMeasuresAll = dedupeMeasures(measures || []);
    } catch(e) {}
    // Set up tab bar and render default overview tab
    setupBldTabs();
    renderBldTab('overview');
    // Demo modules: 需要关注情况 + AI 总结
    if (window.BldModules && window.BldModules.onBuildingLoaded) {
      try { BldModules.onBuildingLoaded(state.selectedBuildingId); } catch (e) { console.error('BldModules hook failed:', e); }
    }
    // Pre-compute other tab data in background
    setTimeout(() => {
      renderAssetModule(state.selectedBuildingId);
      renderEnergyModule(state.selectedBuildingId);
      renderCostModule();
    }, 200);
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

  // Back-fill filter bar to reflect opened building
  syncFiltersToBuilding(selectedBld);

  function filterBuildings(query) {
    const q = query.toLowerCase().trim();
    // Empty → constrained by active filters; typed query → search ALL buildings
    if (!q) return buildings.filter(buildingMatchesActiveFilters).slice(0, 50);
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
      <div class="building-option px-3 py-2 text-sm cursor-pointer border-b border-slate-50 last:border-0 hover:bg-blue-50 ${b.id == selectedId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}"
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

  // Set up listeners once (sidebar search elements already exist in HTML)
  if (!setupBuildingSelect._initialized) {
    setupBuildingSelect._initialized = true;
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

  // Expose hook to re-render filter-constrained dropdown
  setupBuildingSelect._renderFiltered = function() {
    var inp = document.getElementById('buildingSearchInput');
    renderDropdown(filterBuildings(inp ? inp.value : ''));
  };

  // ---- Top bar building search ----
  const topInput = document.getElementById('buildingSelectSearch');
  if (topInput) {
    topInput.value = selectedBld ? `${selectedBld.name} (${selectedBld.region} · ${selectedBld.city})` : '';
    if (!topInput._bound) {
      topInput._bound = true;
      const topDropdown = document.getElementById('buildingSelectDropdown');
      const renderTop = (list) => {
        if (!topDropdown) return;
        const shown = list.slice(0, 50);
        if (shown.length === 0) {
          topDropdown.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400">未找到匹配楼宇</div>';
          topDropdown.style.display = 'block';
          return;
        }
        topDropdown.innerHTML = shown.map(b => `
          <div class="px-3 py-2 text-sm cursor-pointer border-b border-slate-50 last:border-0 hover:bg-blue-50 text-slate-700" data-bid="${b.id}">
            <div>${b.name}</div>
            <div class="text-xs text-slate-400">${b.region} · ${b.city} · ${b.asset_type}</div>
          </div>`).join('');
        topDropdown.querySelectorAll('div[data-bid]').forEach(opt => {
          opt.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const bid = parseInt(opt.dataset.bid);
            if (topDropdown) topDropdown.style.display = 'none';
            loadBuildingView(bid);
          });
        });
        topDropdown.style.display = 'block';
      };
      topInput.addEventListener('focus', () => renderTop(filterBuildings(topInput.value)));
      topInput.addEventListener('input', () => renderTop(filterBuildings(topInput.value)));
      topInput.addEventListener('click', () => renderTop(filterBuildings(topInput.value)));
      document.addEventListener('click', function hideTopDropdown(e) {
        if (topDropdown && !topDropdown.contains(e.target) && e.target !== topInput) {
          topDropdown.style.display = 'none';
        }
      });
    }
  }
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
  state._cachedBuildingInfo = b; // Cache for space tab

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
        <button onclick="addToCompare(${b.id})" class="rounded-xl border border-blue-200 bg-white px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 transition" title="加入对比">⊕ 对比</button>
        <button onclick="saveBuildingInfo(${b.id})" class="rounded-xl bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition">保存信息</button>
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
    </div>
    <div class="mt-3 flex items-center gap-2" id="bldTagContainer"></div>`;

  // Render building tags + make edit fields obvious
  setTimeout(() => {
    renderBuildingTags(buildingId);
    document.querySelectorAll('.building-editable').forEach(inp => {
      inp.style.background = '#fafbfc';
      inp.title = '可编辑，修改后点击"保存信息"';
    });
  }, 50);
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
// ---- Building Tab System ----
const BLD_TABS = {
  overview: { name: '总览', dims: null },
  safety: { name: '环境安全', dims: ['D15'] },
  temperature: { name: '温度适宜', dims: ['D16'] },
  lighting: { name: '照明亮堂', dims: ['D17'] },
  air: { name: '空气清新', dims: ['D18'] },
  energy: { name: '能效与设备', dims: ['D11','D14'] },
  service: { name: '服务效率', dims: ['D12','D02'] },
  space: { name: '空间与资产', dims: ['D01'] },
  cost: { name: '成本分析', dims: null },
  improve: { name: '改进计划', dims: null },
  supplier: { name: '供应商', dims: null },
};

function setupBldTabs() {
  if (setupBldTabs._done) return;
  setupBldTabs._done = true;
  const bar = document.getElementById('bldTabBar');
  if (!bar) return;
  bar.querySelectorAll('.bld-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.bld-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBldTab(btn.dataset.bldtab);
    });
  });
}

function renderBldTab(tabKey) {
  const container = document.getElementById('bldTabContent');
  if (!container) return;
  // Demo modules provide their own tabs (tickets/mail/consumables/asset/energy)
  if (window.BldModules && window.BldModules.tabs[tabKey]) {
    window.BldModules.tabs[tabKey](container, state.selectedBuildingId);
    return;
  }
  const data = state.buildingIndicatorsData;
  if (!data) return;

  const tab = BLD_TABS[tabKey];
  if (!tab) return;

  let html = '';

  if (tabKey === 'overview') {
    html = renderOverviewTab(data);
  } else if (tabKey === 'improve') {
    html = renderImproveTab();
  } else if (tabKey === 'supplier') {
    html = renderSupplierTab();
  } else if (tabKey === 'cost') {
    html = renderCostTabContent();
  } else if (tabKey === 'space') {
    html = renderSpaceTabContent();
  } else if (tab.dims) {
    html = renderDimensionTab(tabKey, tab.dims, data);
  } else {
    html = '<div class="content-card text-center py-12 text-slate-400">即将上线</div>';
  }

  container.innerHTML = html;
  bindTabInteractions(tabKey);
}

function renderOverviewTab(data) {
  const dims = data.dimensions || [];
  const sorted = [...dims].sort((a, b) => (a.completion_rate || 0) - (b.completion_rate || 0));
  const topRisks = sorted.slice(0, 3).filter(d => d.completion_rate < 100);
  const topStrengths = [...dims].sort((a, b) => (b.completion_rate || 0) - (a.completion_rate || 0)).slice(0, 3);

  let alerts = '';
  if (topRisks.length > 0) {
    alerts = topRisks.map((d, i) => {
      const cls = d.completion_rate < 50 ? 'bld-alert-danger' : d.completion_rate < 80 ? 'bld-alert-warn' : 'bld-alert-info';
      return `<div class="bld-alert-card ${cls}"><b>⚠ ${d.dimension_name}</b> 达标率 ${d.completion_rate}% — 需重点关注${d.completion_rate < 50 ? '，存在严重风险' : ''}</div>`;
    }).join('');
  } else {
    alerts = '<div class="bld-alert-card bld-alert-info">✅ 所有维度均达标，保持当前管理节奏</div>';
  }

  // Dimension mini cards
  const dimCards = dims.slice(0, 12).map(d => {
    const rate = d.completion_rate || 0;
    const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
    const bg = rate >= 90 ? '#f0fdf4' : rate >= 70 ? '#fffbeb' : '#fef2f2';
    return `<div class="text-center p-2 rounded-xl cursor-pointer hover:shadow-sm transition" style="background:${bg}" onclick="switchBldTabForDim('${d.dimension_id}')" title="点击查看${d.dimension_name}详情">
      <div class="text-lg font-bold" style="color:${color}">${rate}%</div>
      <div class="text-[0.6rem] text-slate-500 mt-0.5">${d.dimension_name}</div>
    </div>`;
  }).join('');

  return `
    ${alerts ? `<div class="mb-4">${alerts}</div>` : ''}
    <div class="content-card">
      <div class="bld-section-title">📋 维度达标率概览</div>
      <div class="grid grid-cols-6 gap-2">${dimCards}</div>
      ${topStrengths.length > 0 ? `
        <div class="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
          <span class="text-xs text-slate-400">优势维度:</span>
          ${topStrengths.map(d => `<span class="badge badge-green">${d.dimension_name} ${d.completion_rate}%</span>`).join(' ')}
        </div>` : ''}
    </div>`;
}

function renderDimensionTab(tabKey, dimIds, data) {
  const measures = state.buildingMeasuresAll || [];
  const linkedMeasures = measures.filter(m => {
    const mDims = (m.dimension_ids || '').split(',').map(s => s.trim());
    return dimIds.some(d => mDims.includes(d));
  });

  // Alerts
  const dimData = (data.dimensions || []).filter(d => dimIds.includes(d.dimension_id));
  const belowTarget = dimData.filter(d => (d.completion_rate || 0) < 80);
  const alerts = belowTarget.map(d => {
    const cls = d.completion_rate < 50 ? 'bld-alert-danger' : 'bld-alert-warn';
    return `<div class="bld-alert-card ${cls}"><b>⚠ ${d.dimension_name}</b> — 达标率仅 ${d.completion_rate}%，${d.completion_rate < 50 ? '需立即采取行动' : '建议关注'}</div>`;
  }).join('');

  // Render editable indicator table
  const indicators = (data.indicators || []).filter(ind => dimIds.includes(ind.dimension_id));
  let indicatorRows = '';
  if (indicators.length > 0) {
    indicatorRows = indicators.map(ind => {
      const rate = ind.completion_rate;
      const prevRate = ind.prev_rate;
      const actualVal = state.dirtyValues[ind.id] !== undefined ? state.dirtyValues[ind.id] : ind.actual_value;
      const isDirty = state.dirtyValues[ind.id] !== undefined;
      let statusCls = 'bld-status-pass';
      if (rate == null) statusCls = 'bld-status-na';
      else if (rate < 80) statusCls = 'bld-status-fail';
      else if (rate < 100) statusCls = 'bld-status-warn';
      const trend = prevRate != null && rate != null ? (rate > prevRate ? '↑' : rate < prevRate ? '↓' : '→') : '';
      const trendColor = trend === '↑' ? '#22c55e' : trend === '↓' ? '#ef4444' : '#94a3b8';
      const rateCls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
      return `<tr class="${isDirty ? 'bg-amber-50/30' : ''}">
        <td><span class="dim-color-bar" style="background:${DIM_COLORS[ind.dimension_id] || '#8d9aa8'}"></span>${ind.name}</td>
        <td class="text-xs text-slate-400">${ind.target_value || '—'}</td>
        <td><input class="ind-input ${isDirty ? 'ring-amber-300 border-amber-300' : ''}" data-ind="${ind.id}" data-target="${ind.target_value || ''}" data-target-type="${ind.target_type || ''}" type="number" step="any" value="${actualVal != null ? actualVal : ''}" placeholder="填写" style="width:80px" /></td>
        <td><span class="badge ${rateCls}" data-rate-cell="${ind.id}">${rate != null ? rate + '%' : '—'}</span></td>
        <td style="color:${trendColor};font-size:0.7rem">${trend}</td>
        <td class="text-xs text-slate-400">${ind.definition || ''}</td>
      </tr>`;
    }).join('');
  }

  // Linked measures
  let measuresHtml = '';
  if (linkedMeasures.length > 0) {
    measuresHtml = linkedMeasures.slice(0, 10).map(m => `
      <tr>
        <td class="text-xs">${m.name || '-'}</td>
        <td><span class="badge ${m.status === '已完成' ? 'badge-green' : m.status === '进行中' ? 'badge-blue' : m.status === '超期' ? 'badge-red' : 'badge-gray'}">${m.status}</span></td>
        <td class="text-xs text-slate-400">${m.completion_phase || '-'}</td>
        <td class="text-xs">${m.budget ? '¥'+(m.budget/10000).toFixed(1)+'万' : '-'}</td>
      </tr>`).join('');
  } else {
    measuresHtml = '<tr><td colspan="4" class="text-xs text-slate-400 py-4 text-center">暂无关联改进措施</td></tr>';
  }

  return `
    ${alerts ? `<div class="mb-4">${alerts}</div>` : ''}
    <div class="content-card" id="dimTabCard-${tabKey}">
      <div class="flex items-center justify-between mb-3">
        <div class="bld-section-title" style="margin:0;padding:0;border:none">📋 指标状态 <span class="text-xs text-slate-400 font-normal">(可直接编辑实际值)</span></div>
        <div class="flex items-center gap-2">
          <span id="dimSaveStatus-${tabKey}" class="text-xs text-slate-400 hidden">已保存</span>
          <button id="btnDimSave-${tabKey}" class="rounded-lg bg-blue-500 hover:bg-blue-600 px-3 py-1 text-xs font-medium text-white transition">保存</button>
        </div>
      </div>
      ${indicatorRows ? `
        <div class="frozen-pane" style="max-height:400px;overflow-y:auto;border:1px solid #f1f5f9;border-radius:12px">
        <table class="data-table">
          <thead><tr><th>指标名称</th><th>目标值</th><th>实际值</th><th>完成率</th><th>趋势</th><th>说明</th></tr></thead>
          <tbody>${indicatorRows}</tbody></table></div>` : '<p class="text-sm text-slate-400 py-4">暂无指标数据</p>'}
    </div>
    <div class="content-card mt-4">
      <div class="bld-section-title">🔧 关联改进措施 <span class="text-xs text-slate-400 font-normal">(${linkedMeasures.length} 条)</span></div>
      <div class="frozen-pane" style="max-height:300px;overflow-y:auto;border:1px solid #f1f5f9;border-radius:12px">
      <table class="data-table">
        <thead><tr><th>措施名称</th><th>状态</th><th>阶段</th><th>预算</th></tr></thead>
        <tbody>${measuresHtml}</tbody></table></div>
    </div>`;
}

// Bind edit handlers for dimension tab indicator inputs
function bindDimTabEdits(tabKey) {
  const card = document.getElementById(`dimTabCard-${tabKey}`);
  if (!card) return;

  card.querySelectorAll('.ind-input').forEach(input => {
    if (input.dataset.bound) return; // already bound
    input.dataset.bound = '1';
    const indId = input.dataset.ind;

    input.addEventListener('input', () => {
      const val = input.value.trim();
      const numVal = val === '' ? null : parseFloat(val);
      state.dirtyValues[indId] = numVal;
      input.classList.add('ring-amber-300', 'border-amber-300');
      const row = input.closest('tr');
      if (row) row.classList.add('bg-amber-50/30');
      // Live rate preview
      const rateCell = card.querySelector(`[data-rate-cell="${indId}"]`);
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
    });

    input.addEventListener('blur', async () => {
      const val = input.value.trim();
      const actualValue = val === '' ? null : parseFloat(val);
      state.dirtyValues[indId] = actualValue;
      if (state.dirtyValues[indId] !== undefined) {
        try {
          await saveBuildingIndicators(state.selectedBuildingId, state.currentPeriod, [
            { indicator_id: indId, actual_value: actualValue, notes: '' }
          ]);
          delete state.dirtyValues[indId];
          input.classList.remove('ring-amber-300', 'border-amber-300');
          const row = input.closest('tr');
          if (row) row.classList.remove('bg-amber-50/30');
          // Reload data
          state.buildingIndicatorsData = await fetchBuildingIndicators(state.selectedBuildingId, state.currentPeriod);
          const updatedInd = (state.buildingIndicatorsData.indicators || []).find(i => i.id === indId);
          if (updatedInd) {
            const rate = updatedInd.completion_rate;
            const rateCell = card.querySelector(`[data-rate-cell="${indId}"]`);
            if (rateCell) {
              const cls = rate != null ? (rate >= 100 ? 'badge-green' : rate >= 70 ? 'badge-amber' : 'badge-red') : 'badge-gray';
              rateCell.className = `badge ${cls}`;
              rateCell.textContent = rate != null ? rate + '%' : '—';
            }
          }
        } catch(e) { console.error('Auto-save failed:', e); }
      }
    });
  });

  // Save button handler
  const saveBtn = document.getElementById(`btnDimSave-${tabKey}`);
  const statusEl = document.getElementById(`dimSaveStatus-${tabKey}`);
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const dirtyInputs = [...card.querySelectorAll('.ind-input')].filter(inp => state.dirtyValues[inp.dataset.ind] !== undefined);
      if (dirtyInputs.length === 0) { showToast('没有需要保存的修改', 'error'); return; }
      const values = dirtyInputs.map(inp => ({
        indicator_id: inp.dataset.ind,
        actual_value: state.dirtyValues[inp.dataset.ind],
        notes: ''
      }));
      try {
        await saveBuildingIndicators(state.selectedBuildingId, state.currentPeriod, values);
        values.forEach(v => { delete state.dirtyValues[v.indicator_id]; });
        dirtyInputs.forEach(inp => {
          inp.classList.remove('ring-amber-300', 'border-amber-300');
          const row = inp.closest('tr');
          if (row) row.classList.remove('bg-amber-50/30');
        });
        if (statusEl) { statusEl.classList.remove('hidden'); setTimeout(() => statusEl.classList.add('hidden'), 2000); }
        showToast('指标已保存', 'success');
        // Reload full data
        state.buildingIndicatorsData = await fetchBuildingIndicators(state.selectedBuildingId, state.currentPeriod);
        // Re-render tab with fresh data
        renderBldTab(tabKey);
      } catch(e) { showToast('保存失败: ' + e.message, 'error'); }
    };
  }
}

function renderImproveTab() {
  // Render full measures table synchronously to avoid flicker
  const measures = state.buildingMeasuresAll || [];
  const filter = state.buildingMeasureFilter || { dim: '', phase: '', initiator: '' };
  let filtered = [...measures];
  if (filter.dim) filtered = filtered.filter(m => (m.dimension_ids || '').split(',').map(s => s.trim()).includes(filter.dim));
  if (filter.phase) filtered = filtered.filter(m => m.completion_phase === filter.phase);
  if (filter.initiator) filtered = filtered.filter(m => (m.initiator || '字节') === filter.initiator);
  filtered.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  const totalBudget = filtered.reduce((s, m) => s + (m.budget || 0), 0);
  const totalBld = filtered.reduce((s, m) => s + (m.total_bld || 0), 0);
  const dimOpts = Object.entries(state.dimNameMap).map(([id, name]) => `<option value="${id}" ${filter.dim === id ? 'selected' : ''}>${name}</option>`).join('');
  const phases = ['3个月内', '6个月内', '1年内', '1年以上'];

  return `<div class="content-card">
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <button id="btnShowMeasureForm" class="rounded-lg border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-500 hover:bg-blue-50 transition">+ 新建措施</button>
      <span class="text-xs text-slate-400">筛选:</span>
      <select id="bldMeasureDimFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1"><option value="">全部维度</option>${dimOpts}</select>
      <select id="bldMeasurePhaseFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1"><option value="">全部阶段</option>${phases.map(p => `<option value="${p}" ${filter.phase === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select id="bldMeasureInitiatorFilter" class="rounded-lg border-slate-200 bg-white text-xs px-2 py-1"><option value="">全部发起方</option><option value="字节" ${filter.initiator==='字节'?'selected':''}>字节</option><option value="供应商" ${filter.initiator==='供应商'?'selected':''}>供应商</option></select>
      ${totalBudget > 0 ? `<span class="text-xs text-slate-500">总预算: <b class="text-slate-700">¥${(totalBudget/10000).toFixed(1)}万</b></span>` : ''}
      <span class="text-xs text-slate-400">${filtered.length} 条</span>
      <button id="btnGanttView" class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 transition">📊 甘特图</button>
      <button id="btnEffectValidation" class="rounded-lg border border-blue-200 bg-white px-3 py-1 text-xs text-blue-500 hover:bg-blue-50 transition">📈 效果验证</button>
      <button id="btnExportBldMeasures" class="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 transition">导出 CSV</button>
    </div>
    <div id="effectValidationSection" class="hidden mt-3 p-4 bg-blue-50/30 rounded-xl border border-blue-100"></div>
    <div id="buildingMeasures">${filtered.length === 0
      ? '<p class="text-sm text-slate-400 py-4 text-center">暂无匹配措施</p>'
      : '<table class="data-table"><thead><tr><th>措施</th><th>关联维度</th><th>发起方</th><th>计划完成</th><th>预算</th><th>判断标准</th><th>状态</th></tr></thead><tbody>' +
      filtered.map(m => {
        let deadlineHtml = '-';
        if (m.planned_end_date) {
          const today = new Date(); today.setHours(0,0,0,0);
          const planDate = new Date(m.planned_end_date);
          const diffDays = Math.ceil((planDate - today) / (1000 * 60 * 60 * 24));
          if (m.status === '已完成') {
            deadlineHtml = '<span class="text-xs text-slate-400">' + m.planned_end_date + '</span>';
          } else if (diffDays < 0) {
            deadlineHtml = '<span class="text-xs font-semibold text-red-600">超期 ' + Math.abs(diffDays) + ' 天</span>';
          } else if (diffDays <= 7) {
            deadlineHtml = '<span class="text-xs font-semibold text-amber-600">' + diffDays + ' 天后到期</span>';
          } else {
            deadlineHtml = '<span class="text-xs text-slate-500">' + m.planned_end_date + '</span>';
          }
        }
        return '<tr>' +
        '<td class="text-xs font-medium max-w-[200px]" title="' + (m.description || '').replace(/"/g, '&quot;') + '">' + (m.name || '-') + '</td>' +
        '<td class="text-xs"><span class="badge" style="' + dimBadgeStyle(m.dimension_ids) + '">' + dimIdToName(m.dimension_ids) + '</span></td>' +
        '<td class="text-xs"><span class="badge ' + (m.initiator === '供应商' ? 'badge-amber' : 'badge-blue') + '">' + (m.initiator || '字节') + '</span></td>' +
        '<td>' + deadlineHtml + '</td>' +
        '<td class="text-xs">' + (m.budget != null ? '¥' + (m.budget/10000).toFixed(1) + '万' : '-') + '</td>' +
        '<td class="text-xs max-w-[100px]">' + (m.expected_effect || '-') + '</td>' +
        '<td><select class="measure-status-select rounded-lg border-slate-200 text-xs px-1 py-0.5" data-mid="' + m.id + '" data-bid="' + m.building_id + '">' +
          '<option value="未开始" ' + (m.status==='未开始'?'selected':'') + '>未开始</option>' +
          '<option value="进行中" ' + (m.status==='进行中'?'selected':'') + '>进行中</option>' +
          '<option value="已完成" ' + (m.status==='已完成'?'selected':'') + '>已完成</option>' +
          '<option value="超期" ' + (m.status==='超期'?'selected':'') + '>超期</option></select></td>' +
      '</tr>'; }).join('') + '</tbody></table>'}</div>
  </div>`;
}

function renderCostTabContent() {
  const measures = state.buildingMeasuresAll || [];
  const mBudget = measures.reduce((s, m) => s + (m.budget || 0), 0);
  const hasBudget = mBudget > 0;
  const byDim = {};
  measures.forEach(m => { const d = m.dimension_ids || '其他'; if (!byDim[d]) byDim[d] = 0; byDim[d] += (m.budget || 0); });
  // Filter dimensions that have budget
  const dimEntries = Object.entries(byDim).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 8);

  return `<div class="content-card"><div class="bld-section-title">💰 费用概览</div>
    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="rounded-xl bg-slate-50 p-3"><div class="text-slate-400 text-xs">改进总预算</div><div class="text-lg font-bold">${hasBudget ? '¥'+(mBudget/10000).toFixed(1)+'万' : '—'}</div></div>
      <div class="rounded-xl bg-slate-50 p-3"><div class="text-slate-400 text-xs">措施数</div><div class="text-lg font-bold">${measures.length}</div></div>
      <div class="rounded-xl bg-slate-50 p-3"><div class="text-slate-400 text-xs">平均单价</div><div class="text-lg font-bold">${measures.length>0 && hasBudget ? '¥'+(mBudget/measures.length/10000).toFixed(2)+'万' : '—'}</div></div>
    </div>
    <div class="bld-section-title">📋 按维度分布</div>
    ${dimEntries.length === 0 ? '<p class=\"text-xs text-slate-400 py-2\">暂无费用数据</p>' : `<div class=\"space-y-1\">${dimEntries.map(([dim, budget]) => {
      const pct = (budget/mBudget*100);
      return `<div class=\"flex items-center gap-2 text-xs\"><span class=\"w-20 text-slate-500 truncate\">${dimIdToName(dim)}</span>
        <div class=\"flex-1 h-3 rounded-full bg-slate-100\"><div class=\"h-full rounded-full bg-blue-400\" style=\"width:${pct}%\"></div></div>
        <span class=\"w-12 text-right\">${pct.toFixed(0)}%</span></div>`;
    }).join('')}</div>`}</div>`;
}

function renderSpaceTabContent() {
  const b = state._cachedBuildingInfo;
  if (!b) return '<div class="content-card"><p class="text-sm text-slate-400 py-4 text-center">加载建筑信息中…</p></div>';
  return `<div class="content-card"><div class="bld-section-title">🏢 空间与资产</div>
    <div class="grid grid-cols-2 gap-2 text-xs">${[
      { label: '资产性质', value: b.asset_type || '未填写' },
      { label: '工位数', value: b.headcount != null ? b.headcount : '未填写' },
      { label: '面积(㎡)', value: b.area_sqm != null ? b.area_sqm.toLocaleString() : '未填写' },
      { label: '层数', value: b.floors != null ? b.floors : '未填写' },
      { label: '楼龄(年)', value: b.building_age != null ? b.building_age : '未填写' },
      { label: '门禁数', value: b.access_gates != null ? b.access_gates : '未填写' },
      { label: '供应商', value: b.supplier || '未填写' },
      { label: '业务线', value: b.business_lines || '未填写' },
    ].map(f => `<div class="rounded-xl border border-slate-100 bg-white/50 p-2.5">
      <div class="text-slate-400">${f.label}</div>
      <div class="font-semibold mt-0.5 ${f.value==='未填写'?'text-slate-300':'text-slate-700'}">${f.value}</div>
    </div>`).join('')}</div></div>`;
}

function bindTabInteractions(tabKey) {
  if (tabKey === 'improve') {
    bindImproveTabHandlers();
  } else if (tabKey === 'cost') {
    // Cost tab is fully rendered synchronously, no extra binding needed
  } else if (tabKey === 'space') {
    // Space tab is fully rendered synchronously, no extra binding needed
  } else if (BLD_TABS[tabKey] && BLD_TABS[tabKey].dims) {
    setTimeout(() => bindDimTabEdits(tabKey), 50);
  }
}

function renderSupplierTab() {
  const b = state._cachedBuildingInfo;
  const supplier = b ? b.supplier : null;
  if (!supplier) return '<div class="content-card text-center py-12 text-slate-400">该楼宇未关联供应商</div>';

  // Get supplier stats from vendor data if available
  const measures = state.buildingMeasuresAll || [];
  const sMeasures = measures.length;
  const sBudget = measures.reduce((s, m) => s + (m.budget || 0), 0);

  return `<div class="content-card">
    <div class="bld-section-title">🏢 供应商信息</div>
    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-400">供应商名称</div><div class="text-lg font-bold text-slate-800">${supplier}</div></div>
      <div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-400">覆盖楼宇</div><div class="text-lg font-bold text-slate-800">${(state.vendorData?.suppliers||[]).find(v => v.supplier === supplier)?.building_count || '...'} 栋</div></div>
      <div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-400">改进措施/预算</div><div class="text-lg font-bold text-slate-800">${sMeasures} 条 / ¥${(sBudget/10000).toFixed(1)}万</div></div>
    </div>
    <div class="flex items-center gap-4">
      <a onclick="window.showVendorDetail('${supplier}');document.querySelectorAll('.sidebar-nav').forEach(b=>b.classList.remove('active'));document.querySelector('[data-view=vendor]').classList.add('active');" class="text-sm text-blue-500 hover:text-blue-600 cursor-pointer">查看供应商详情 →</a>
      <span class="text-xs text-slate-400">跳转至供应商管理页面</span>
    </div>
  </div>`;
}

function bindImproveTabHandlers() {
  // Measure form toggle
  const addBtn = document.getElementById('btnShowMeasureForm');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', () => {
      const form = document.getElementById('measureAddForm');
      if (form) { form.remove(); return; }
      addBtn.insertAdjacentHTML('afterend', measureFormHtml());
      bindMeasureFormSubmit();
    });
  }
  // Status change handlers
  document.querySelectorAll('.measure-status-select').forEach(sel => {
    if (sel._bound) return;
    sel._bound = true;
    sel.addEventListener('change', async () => {
      try {
        await updateMeasure(sel.dataset.bid, sel.dataset.mid, { status: sel.value });
        showToast('状态已更新', 'success');
      } catch (e) { showToast('更新失败', 'error'); }
    });
  });
  // Filter handlers
  const dimFilter = document.getElementById('bldMeasureDimFilter');
  const phaseFilter = document.getElementById('bldMeasurePhaseFilter');
  if (dimFilter && !dimFilter._bound) {
    dimFilter._bound = true;
    dimFilter.addEventListener('change', () => {
      state.buildingMeasureFilter.dim = dimFilter.value;
      renderBuildingMeasuresView();
    });
  }
  if (phaseFilter && !phaseFilter._bound) {
    phaseFilter._bound = true;
    phaseFilter.addEventListener('change', () => {
      state.buildingMeasureFilter.phase = phaseFilter.value;
      renderBuildingMeasuresView();
    });
  }
  const initiatorFilter = document.getElementById('bldMeasureInitiatorFilter');
  if (initiatorFilter && !initiatorFilter._bound) {
    initiatorFilter._bound = true;
    initiatorFilter.addEventListener('change', () => {
      if (!state.buildingMeasureFilter) state.buildingMeasureFilter = { dim: '', phase: '', initiator: '' };
      state.buildingMeasureFilter.initiator = initiatorFilter.value;
      renderBuildingMeasuresView();
    });
  }
  // Export button
  const exportBtn = document.getElementById('btnExportBldMeasures');
  if (exportBtn && !exportBtn._bound) {
    exportBtn._bound = true;
    exportBtn.addEventListener('click', () => exportBuildingCSV());
  }
  // Gantt button
  const ganttBtn = document.getElementById('btnGanttView');
  if (ganttBtn && !ganttBtn._bound) {
    ganttBtn._bound = true;
    ganttBtn.addEventListener('click', () => toggleBldMeasuresGantt());
  }
  // Effect validation button
  const effectBtn = document.getElementById('btnEffectValidation');
  if (effectBtn && !effectBtn._bound) {
    effectBtn._bound = true;
    effectBtn.addEventListener('click', () => toggleEffectValidation());
  }
}

// Global function to switch tab by dimension ID
window.switchBldTabForDim = function(dimId) {
  for (const [key, tab] of Object.entries(BLD_TABS)) {
    if (tab.dims && tab.dims.includes(dimId)) {
      const bar = document.getElementById('bldTabBar');
      if (bar) {
        bar.querySelectorAll('.bld-tab').forEach(b => b.classList.remove('active'));
        const target = bar.querySelector(`[data-bldtab="${key}"]`);
        if (target) target.classList.add('active');
      }
      renderBldTab(key);
      return;
    }
  }
};

// ---- Radar Chart ----
async function updateRadarChart(buildingId) {
  try {
    // Use cached H1 data if available, otherwise fetch
    const h1Data = state.buildingIndicatorsData || await fetchBuildingIndicators(buildingId, 'H1_2026');
    const h2Data = await fetchBuildingIndicators(buildingId, 'H2_2025');
    state.radarData = { h1: h1Data, h2: h2Data };
    const dom = document.getElementById('chartRadar');
    if (dom) {
      renderRadarChart('chartRadar', h1Data.dimensions, h2Data.dimensions);
    }
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
    <div id="measureAddForm" class="mb-4 rounded-2xl border border-blue-200/60 bg-blue-50/50 p-4">
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
          <label class="block text-xs text-slate-500 mb-1">发起方</label>
          <select id="mfInitiator" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5">
            <option value="字节">字节</option>
            <option value="供应商">供应商</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">负责人</label>
          <input id="mfAssignee" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5" placeholder="指派负责人">
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
          <label class="block text-xs text-slate-500 mb-1">计划完成日期</label>
          <input id="mfPlanDate" type="date" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">判断标准</label>
          <input id="mfEffect" class="w-full rounded-lg border-slate-200 text-xs px-2 py-1.5" placeholder="描述判断标准">
        </div>
        <div class="flex items-end gap-2">
          <button id="btnSubmitMeasure" class="rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition">提交</button>
          <button id="btnCancelMeasure" class="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition">取消</button>
        </div>
      </div>
    </div>`;
}

async function renderBuildingMeasures() {
  try {
    const measures = await fetchBuildingMeasures(state.selectedBuildingId);
    state.buildingMeasuresAll = dedupeMeasures(measures || []);
    state.buildingMeasureFilter = { dim: '', phase: '' };
    renderBuildingMeasuresView();
  } catch (err) {
    console.error('Measures load failed:', err);
    const container = $('#buildingMeasures');
    if (container) container.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">改进方案数据加载失败</p>';
  }
}

function renderBuildingMeasuresView() {
  // Re-render the improve tab synchronously
  const tabContent = document.getElementById('bldTabContent');
  const activeTab = document.querySelector('.bld-tab.active');
  if (tabContent && activeTab && activeTab.dataset.bldtab === 'improve') {
    tabContent.innerHTML = renderImproveTab();
    bindImproveTabHandlers();
  }
  return;
}
/* old direct-DOM code below is dead but kept for reference
  const container = $('#buildingMeasures');
  if (!container) return; // Not on improve tab — silently skip
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
      <button id="btnGanttView" class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 transition" onclick="toggleBldMeasuresGantt()">📊 甘特图</button>
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
*/

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
      expected_effect: $('#mfEffect').value.trim() || null,
      assignee: $('#mfAssignee').value.trim() || null,
      initiator: $('#mfInitiator').value || '字节',
      planned_end_date: $('#mfPlanDate').value || null
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

// ---- Dimension Detail View (National Perspective) ----
const DIM_CONFIG = {
  D15: { name: '环境安全', icon: '🛡️' },
  D16: { name: '温度适宜', icon: '🌡️' },
  D17: { name: '照明亮堂', icon: '💡' },
  D18: { name: '空气清新', icon: '🌬️' }
};

// Dimension code moved to dimension.js
// (orphaned code cleaned up)
// (empty - dimension code in dimension.js)
// ---- Vendor Management ----
async function loadVendorView() {
  const panel = $('#viewVendor');
  showLoading(panel);
  try {
    const data = await apiGet('/api/vendors');
    state.vendorData = data;
    // Each render is independently error-safe
    try { renderVendorKpiCards(data); } catch(e) { console.error('KPI cards:', e); }
    try { renderVendorShareChart(data); } catch(e) { console.error('Share chart:', e); }
    // 供应商KPI排名: 待开发 (renderVendorRankChart kept for future use)
    try { renderVendorDetailTable(data); } catch(e) { console.error('Detail table:', e); }
    try { renderVendorMeasuresTable(data); } catch(e) { console.error('Measures table:', e); }
    try { renderVendorDimMatrix(data); } catch(e) { console.error('Dim matrix:', e); }
    try { renderVendorRadarCompare(data); } catch(e) { console.error('Vendor radar:', e); }
    // Show overview, hide detail
    $('#vendorOverviewWrap').style.display = '';
    $('#vendorSingleView').classList.add('hidden');
  } catch (err) {
    console.error('Vendor load failed:', err);
    showToast('加载供应商数据失败: ' + err.message, 'error');
  } finally {
    hideLoading(panel);
  }
}

function renderVendorKpiCards(data) {
  const container = $('#vendorKpiCards');
  const suppliers = data.suppliers || [];
  const totalBlds = suppliers.reduce((s, v) => s + v.building_count, 0);
  const measures = data.measures || [];
  const totalMeasures = measures.reduce((s, m) => s + m.cnt, 0);
  const totalBudget = measures.reduce((s, m) => s + (m.total_budget || 0), 0);
  const cards = [
    { label: '供应商总数', value: suppliers.length, sub: '' },
    { label: '覆盖楼宇', value: totalBlds, sub: `最高 ${suppliers[0]?.building_count || 0} 栋` },
    { label: '改进措施总数', value: totalMeasures, sub: `总预算 ¥${(totalBudget/10000).toFixed(0)}万` },
    { label: '集中度 CR3', value: (suppliers.slice(0,3).reduce((s,v)=>s+v.building_count,0)/totalBlds*100).toFixed(0)+'%', sub: suppliers.slice(0,3).map(v=>v.supplier).join('/') },
  ];
  container.innerHTML = cards.map(c => `
    <div class="kpi-card">
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-label">${c.label}</div>
      ${c.sub?`<div class="kpi-sub">${c.sub}</div>`:''}
    </div>`).join('');
}

function renderVendorShareChart(data) {
  const dom = document.getElementById('chartVendorShare');
  if (!dom || dom.clientWidth === 0) return;
  if (typeof getOrCreateChart !== 'function') return;
  const chart = getOrCreateChart('chartVendorShare');
  if (!chart) return;
  const suppliers = data.suppliers || [];
  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} 栋 ({d}%)' },
    series: [{
      type: 'pie', radius: ['45%', '75%'], center: ['50%', '55%'],
      label: { formatter: '{b}\n{d}%', fontSize: 10 },
      data: suppliers.map(v => ({ name: v.supplier, value: v.building_count })),
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.1)' } }
    }]
  });
}

function renderVendorRankChart(data) {
  const dom = document.getElementById('chartVendorRank');
  if (!dom || dom.clientWidth === 0) return;
  if (typeof getOrCreateChart !== 'function') return;
  const chart = getOrCreateChart('chartVendorRank');
  if (!chart) return;
  const suppliers = data.suppliers || [];
  // Compute KPI scores from rates
  const rates = data.rates || [];
  const rateMap = {};
  rates.forEach(r => { if (!rateMap[r.supplier]) rateMap[r.supplier] = []; rateMap[r.supplier].push(r.avg_val); });
  const scores = suppliers.map(v => {
    const vals = rateMap[v.supplier] || [];
    const avg = vals.length > 0 ? vals.reduce((s,x)=>s+x,0)/vals.length : 0;
    return { name: v.supplier, score: Math.round(avg) };
  }).sort((a,b) => b.score - a.score);
  chart.setOption({
    tooltip: {},
    grid: { left: 90, right: 40, top: 10, bottom: 20 },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', fontSize: 10 } },
    yAxis: { type: 'category', data: scores.map(s => s.name).reverse(), axisLabel: { fontSize: 10, color: '#64748b' } },
    series: [{
      type: 'bar', data: scores.map(s => s.score).reverse(),
      label: { show: true, position: 'right', formatter: '{c}%', fontSize: 10 },
      itemStyle: {
        borderRadius: [0, 6, 6, 0],
        color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#93c5fd' }] }
      }
    }]
  });
}

function renderVendorDetailTable(data) {
  const container = $('#vendorDetailTable');
  const suppliers = data.suppliers || [];
  const measures = data.measures || [];
  // Aggregate measures by supplier
  const mMap = {};
  measures.forEach(m => {
    if (!mMap[m.supplier]) mMap[m.supplier] = { total: 0, done: 0, budget: 0 };
    mMap[m.supplier].total += m.cnt;
    if (m.status === '已完成') mMap[m.supplier].done += m.cnt;
    mMap[m.supplier].budget += (m.total_budget || 0);
  });
  container.innerHTML = `<table class="data-table">
    <thead><tr><th>供应商</th><th>覆盖楼宇</th><th>区域数</th><th>自持/租赁</th><th>改进措施</th><th>已完成</th><th>预算总额</th><th>操作</th></tr></thead>
    <tbody>${suppliers.map((v, i) => {
      const mm = mMap[v.supplier] || { total: 0, done: 0, budget: 0 };
      return `<tr>
        <td><a onclick="window.showVendorDetail('${v.supplier}')" class="font-medium">${v.supplier}</a></td>
        <td>${v.building_count} 栋</td>
        <td>${v.regions_covered}</td>
        <td>${v.self_owned}/${v.leased}</td>
        <td>${mm.total}</td>
        <td>${mm.done}</td>
        <td>${mm.budget > 0 ? '¥'+(mm.budget/10000).toFixed(1)+'万' : '-'}</td>
        <td><button onclick="window.showVendorDetail('${v.supplier}')" class="text-xs text-blue-500 hover:underline">查看详情 →</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function renderVendorDimMatrix(data) {
  const container = $('#vendorDimMatrix');
  if (!container) return;
  const suppliers = (data.suppliers || []).map(s => s.supplier);
  const bldRates = data.bldRates || [];
  // Use 6 core dimensions for readability
  const dims = ['D15','D16','D17','D18','D01','D12','D11','D02','D03','D04','D05','D06','D07','D08','D09','D10','D13','D14'];
  const dimNames = {};

  // Aggregate: supplier × dim → avg rate
  const matrix = {};
  suppliers.forEach(s => { matrix[s] = {}; });
  bldRates.forEach(r => {
    if (matrix[r.supplier]) {
      if (!matrix[r.supplier][r.dimension_id]) matrix[r.supplier][r.dimension_id] = [];
      if (r.avg_rate != null) matrix[r.supplier][r.dimension_id].push(r.avg_rate);
    }
  });

  // Get dim names from state
  try {
    const dimData = state.dimNameMap || {};
    dims.forEach(d => { dimNames[d] = dimData[d] || d; });
  } catch(e) { dims.forEach(d => { dimNames[d] = d; }); }

  const colorScale = (v) => {
    if (v == null) return '#f1f5f9';
    if (v >= 90) return '#dcfce7';
    if (v >= 70) return '#fef9c3';
    if (v >= 50) return '#fed7aa';
    return '#fecaca';
  };
  const textColor = (v) => {
    if (v == null) return '#94a3b8';
    if (v >= 90) return '#166534';
    if (v >= 70) return '#854d0e';
    if (v >= 50) return '#9a3412';
    return '#991b1b';
  };

  container.innerHTML = `<div class="frozen-pane" style="max-height:500px;overflow:auto"><table class="data-table">
    <thead><tr><th style="position:sticky;left:0;z-index:3;background:#f8fafc">供应商</th>
    ${dims.map(d => `<th style="font-size:0.6rem;text-align:center;min-width:48px">${dimNames[d] || d}</th>`).join('')}
    <th style="text-align:center">均分</th></tr></thead>
    <tbody>${suppliers.map(s => {
      let allVals = [];
      dims.forEach(d => {
        const vals = matrix[s][d] || [];
        if (vals.length > 0) allVals.push(...vals);
      });
      const avg = allVals.length > 0 ? Math.round(allVals.reduce((a,b)=>a+b,0)/allVals.length) : null;
      return `<tr>
        <td style="position:sticky;left:0;z-index:1;background:#fff;font-weight:600">${s}</td>
        ${dims.map(d => {
          const vals = matrix[s][d] || [];
          const v = vals.length > 0 ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
          return `<td style="text-align:center;background:${colorScale(v)};color:${textColor(v)};font-size:0.7rem;font-weight:600">${v != null ? v+'%' : '—'}</td>`;
        }).join('')}
        <td style="text-align:center;font-weight:700;font-size:0.8rem;background:${colorScale(avg)};color:${textColor(avg)}">${avg != null ? avg+'%' : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderVendorRadarCompare(data) {
  const dom = document.getElementById('chartVendorRadar');
  if (!dom || dom.clientWidth === 0) return;
  if (typeof getOrCreateChart !== 'function') return;
  const chart = getOrCreateChart('chartVendorRadar');
  if (!chart) return;

  const suppliers = (data.suppliers || []).slice(0, 5);
  const bldRates = data.bldRates || [];
  const coreDims = ['D15','D16','D17','D18','D01','D12','D11','D02'];
  const dimShortNames = { D15:'环境', D16:'温度', D17:'照明', D18:'空气', D01:'空间', D12:'响应', D11:'节能', D02:'连续' };

  const colors = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6'];
  const seriesData = suppliers.map(s => {
    const vals = {};
    coreDims.forEach(d => { vals[d] = []; });
    bldRates.forEach(r => {
      if (r.supplier === s && vals[r.dimension_id] !== undefined && r.avg_rate != null) {
        vals[r.dimension_id].push(r.avg_rate);
      }
    });
    return {
      name: s,
      value: coreDims.map(d => {
        const arr = vals[d] || [];
        return arr.length > 0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
      })
    };
  });

  chart.setOption({
    tooltip: {},
    legend: { data: suppliers.map(s => s), bottom: 0, textStyle: { fontSize: 10 } },
    radar: {
      center: ['50%','50%'], radius: '60%',
      indicator: coreDims.map(d => ({ name: dimShortNames[d], max: 100 })),
      axisName: { fontSize: 10, color: '#64748b' }
    },
    series: seriesData.map((s, i) => ({
      name: s.name, type: 'radar',
      data: [{ value: s.value, name: s.name,
        lineStyle: { color: colors[i], width: 1.5 },
        areaStyle: { color: colors[i], opacity: 0.05 },
        itemStyle: { color: colors[i] }, symbol: 'circle', symbolSize: 3
      }]
    }))
  });
}

function renderVendorMeasuresTable(data) {
  const container = $('#vendorMeasuresTable');
  const measures = data.measures || [];
  // Aggregate by supplier + status
  const suppliers = [...new Set(measures.map(m => m.supplier))];
  const statuses = ['未开始', '进行中', '已完成', '超期'];
  container.innerHTML = `<table class="data-table">
    <thead><tr><th>供应商</th>${statuses.map(s => `<th>${s}</th>`).join('')}<th>合计</th><th>完成率</th></tr></thead>
    <tbody>${suppliers.map(sup => {
      const row = statuses.map(st => {
        const m = measures.find(x => x.supplier === sup && x.status === st);
        return `<td>${m ? m.cnt : 0}</td>`;
      }).join('');
      const total = measures.filter(x => x.supplier === sup).reduce((s, x) => s + x.cnt, 0);
      const done = (measures.find(x => x.supplier === sup && x.status === '已完成') || {}).cnt || 0;
      const rate = total > 0 ? Math.round(done / total * 100) : 0;
      return `<tr><td class="font-medium">${sup}</td>${row}<td>${total}</td><td><span class="badge ${rate>=80?'badge-green':rate>=50?'badge-amber':'badge-red'}">${rate}%</span></td></tr>`;
    }).join('')}</tbody></table>`;
}

window.showVendorDetail = async function(vendorName) {
  try {
    const data = await apiGet('/api/vendors/' + encodeURIComponent(vendorName));
    const v = data.supplier;
    const buildings = data.buildings || [];
    const measures = data.measures || [];
    // Compute initiator stats
    const byteInit = measures.filter(m => (!m.initiator || m.initiator === '字节')).length;
    const vendorInit = measures.filter(m => m.initiator === '供应商').length;

    // Hide overview wrap, show detail
    $('#vendorOverviewWrap').style.display = 'none';
    const view = $('#vendorSingleView');
    view.classList.remove('hidden');
    view.innerHTML = `
      <div class="flex items-center gap-3 mb-4">
        <button onclick="window.hideVendorDetail()" class="text-sm text-blue-500 hover:text-blue-600">← 返回供应商总览</button>
        <h3 class="text-lg font-semibold text-slate-800">${v.supplier}</h3>
      </div>
      <div class="grid grid-cols-4 gap-4 mb-5">
        <div class="kpi-card"><div class="kpi-value">${v.building_count}</div><div class="kpi-label">覆盖楼宇</div></div>
        <div class="kpi-card"><div class="kpi-value">${v.regions_covered}</div><div class="kpi-label">覆盖区域</div></div>
        <div class="kpi-card"><div class="kpi-value">${v.self_owned}+${v.leased}</div><div class="kpi-label">自持+租赁</div></div>
        <div class="kpi-card"><div class="kpi-value">${measures.length}</div><div class="kpi-label">改进措施</div><div class="kpi-sub">字节 ${byteInit} / 供应商 ${vendorInit}</div></div>
      </div>
      <div class="grid grid-cols-2 gap-5 mb-5">
        <div class="content-card">
          <h3 class="text-sm font-semibold text-slate-800 mb-3">负责楼宇清单</h3>
          <table class="data-table">
            <thead><tr><th>楼宇名称</th><th>区域</th><th>城市</th><th>资产性质</th><th>操作</th></tr></thead>
            <tbody>${buildings.map(b => `<tr>
              <td>${b.name}</td><td>${b.region}</td><td>${b.city}</td>
              <td><span class="badge ${b.asset_type==='自持园区'?'badge-indigo':'badge-amber'}">${b.asset_type}</span></td>
              <td><a onclick="navigateToBuilding(${b.id})" class="text-blue-500 hover:underline cursor-pointer">查看楼宇 →</a></td>
            </tr>`).join('')}</tbody></table>
        </div>
        <div class="content-card">
          <h3 class="text-sm font-semibold text-slate-800 mb-3">发起方分布</h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl bg-blue-50 p-4 text-center">
              <div class="text-2xl font-bold text-blue-600">${byteInit}</div>
              <div class="text-xs text-blue-500 mt-1">字节发起</div>
            </div>
            <div class="rounded-xl bg-amber-50 p-4 text-center">
              <div class="text-2xl font-bold text-amber-600">${vendorInit}</div>
              <div class="text-xs text-amber-500 mt-1">供应商发起</div>
            </div>
          </div>
          ${vendorInit > 0 ? `<div class="mt-3 text-xs text-slate-500">供应商主动性比率: <b>${(vendorInit/measures.length*100).toFixed(0)}%</b></div>` : ''}
        </div>
      </div>
      <div class="content-card">
        <h3 class="text-sm font-semibold text-slate-800 mb-3">改进措施清单</h3>
        ${measures.length === 0 ? '<p class="text-sm text-slate-400 py-4">暂无措施</p>' : `
        <table class="data-table">
          <thead><tr><th>楼宇</th><th>措施名称</th><th>发起方</th><th>维度</th><th>状态</th><th>预算</th></tr></thead>
          <tbody>${measures.slice(0, 30).map(m => `<tr>
            <td>${m.building_name||'-'}</td>
            <td class="text-xs">${m.name||'-'}</td>
            <td><span class="badge ${m.initiator==='供应商'?'badge-amber':'badge-blue'}">${m.initiator||'字节'}</span></td>
            <td class="text-xs">${dimIdToName(m.dimension_ids)}</td>
            <td><span class="badge ${m.status==='已完成'?'badge-green':m.status==='进行中'?'badge-blue':m.status==='超期'?'badge-red':'badge-gray'}">${m.status}</span></td>
            <td class="text-xs">${m.budget?'¥'+(m.budget/10000).toFixed(1)+'万':'-'}</td>
          </tr>`).join('')}</tbody></table>`}
      </div>`;
  } catch(e) { showToast('加载失败: '+e.message, 'error'); }
};

// Hide vendor detail and show overview (no reload)
window.hideVendorDetail = function() {
  $('#vendorSingleView').classList.add('hidden');
  $('#vendorOverviewWrap').style.display = '';
};

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
