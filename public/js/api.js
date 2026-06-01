// ============================================================
// API Client for Building Profile System
// ============================================================

const API_BASE = '';

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

// ---- Cached data ----
let dimensionsCache = null;
let buildingsCache = null;

async function getDimensions() {
  if (!dimensionsCache) dimensionsCache = await apiGet('/api/dimensions');
  return dimensionsCache;
}

async function getBuildings() {
  if (!buildingsCache) buildingsCache = await apiGet('/api/buildings');
  return buildingsCache;
}

function clearCache() {
  dimensionsCache = null;
  buildingsCache = null;
}

// ---- Domain-specific ----
async function fetchOverview(filters = {}) {
  const params = new URLSearchParams();
  if (filters.region) params.set('region', filters.region);
  if (filters.asset_type) params.set('asset_type', filters.asset_type);
  if (filters.period) params.set('period', filters.period);
  if (filters.prev_period) params.set('prev_period', filters.prev_period);
  const qs = params.toString();
  return apiGet('/api/overview' + (qs ? '?' + qs : ''));
}

async function fetchRegion(regionId) {
  return apiGet(`/api/regions/${encodeURIComponent(regionId)}`);
}

async function fetchBuildingIndicators(buildingId, period) {
  const params = new URLSearchParams({ period });
  return apiGet(`/api/buildings/${buildingId}/indicators?${params}`);
}

async function saveBuildingIndicators(buildingId, period, values) {
  return apiPut(`/api/buildings/${buildingId}/indicators`, { period, values });
}

async function fetchBuildingMeasures(buildingId) {
  return apiGet(`/api/buildings/${buildingId}/measures`);
}

async function updateMeasure(buildingId, measureId, data) {
  return apiPut(`/api/buildings/${buildingId}/measures/${measureId}`, data);
}

async function createMeasure(data) {
  return apiPost('/api/measures', data);
}

async function fetchMeasures(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.dimension_id) params.set('dimension_id', filters.dimension_id);
  if (filters.building_id) params.set('building_id', filters.building_id);
  if (filters.region) params.set('region', filters.region);
  if (filters.limit) params.set('limit', filters.limit);
  const qs = params.toString();
  return apiGet('/api/measures' + (qs ? '?' + qs : ''));
}
