const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, initSchema } = require('../db/init');

const app = express();
const PORT = process.env.PORT || 3456;

// Initialize database (schema + seed if empty)
const db = getDb();
initSchema(db);
const bldCount = db.prepare('SELECT COUNT(*) as cnt FROM buildings').get();
if (bldCount.cnt === 0) {
  console.log('Seeding database...');
  require('../db/seed');
  require('../db/seed_demo_data');
  console.log('Seed complete.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================
// POST /api/login - Simple auth
// ============================================================
app.post('/api/login', (req, res) => {
  const { account, password } = req.body;
  if (account === 'admin' && password === 'admin') {
    res.json({ ok: true, account });
  } else {
    res.json({ ok: false, error: '账号或密码错误' });
  }
});

// ============================================================
// Completion rate calculation
// ============================================================

// Extract numeric value from target strings like "≤16:1", "≥90%", "<1.4人/台", "100%", "0"
function parseTargetNum(targetStr) {
  if (!targetStr) return NaN;
  // Remove comparison prefixes, units, and ratio suffix
  const cleaned = targetStr
    .replace(/^[≤≥<>]\s*/, '')
    .replace(/:.*$/, '')     // remove ":1" ratio suffix
    .replace(/%$/, '')       // remove % suffix
    .replace(/[^0-9.]/g, '') // remove all non-numeric chars
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || cleaned === '' ? NaN : n;
}

function calcIndicatorRate(indicator, actualValue, previousValue) {
  if (actualValue == null) return null;
  if (!indicator.target_value || indicator.target_value === '—') return null;

  const targetType = indicator.target_type;
  const targetStr = indicator.target_value;

  if (targetType === 'upper') {
    const t = parseTargetNum(targetStr);
    if (isNaN(t)) return null;
    if (actualValue <= t) return 100;
    return Math.round((t / actualValue) * 10000) / 100;
  }

  if (targetType === 'lower') {
    const t = parseTargetNum(targetStr);
    if (isNaN(t)) return null;
    if (actualValue >= t) return 100;
    return Math.round((actualValue / t) * 10000) / 100;
  }

  if (targetType === 'fixed') {
    const t = parseTargetNum(targetStr);
    if (isNaN(t)) return null;
    return actualValue === t ? 100 : 0;
  }

  if (targetType === 'trend') {
    if (previousValue == null) return null;
    if (actualValue < previousValue) return 100;
    if (actualValue === previousValue) return 50;
    return 0;
  }

  return null;
}

function calcDimensionRate(indicatorRates) {
  const valid = indicatorRates.filter(r => r != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, r) => s + r, 0) / valid.length * 100) / 100;
}

// ============================================================
// GET /api/dimensions - Dimension + indicator tree
// ============================================================
app.get('/api/dimensions', (req, res) => {
  const db = getDb();
  const dims = db.prepare('SELECT * FROM dimensions ORDER BY sort_order').all();
  const indicators = db.prepare('SELECT * FROM indicators ORDER BY dimension_id, seq').all();

  const tree = dims.map(d => ({
    ...d,
    indicators: indicators.filter(i => i.dimension_id === d.id)
  }));

  res.json(tree);
});

// ============================================================
// GET /api/buildings - Building list with filters
// ============================================================
app.get('/api/buildings', (req, res) => {
  const db = getDb();
  const { region, asset_type, search } = req.query;

  let sql = 'SELECT * FROM buildings WHERE 1=1';
  const params = [];

  if (region) {
    sql += ' AND region = ?';
    params.push(region);
  }
  if (asset_type) {
    sql += ' AND asset_type = ?';
    params.push(asset_type);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR city LIKE ? OR province LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY region, name';

  const buildings = db.prepare(sql).all(...params);
  res.json(buildings);
});

// ============================================================
// GET /api/buildings/:id - Single building detail
// ============================================================
app.get('/api/buildings/:id', (req, res) => {
  const db = getDb();
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });
  res.json(building);
});

// ============================================================
// PUT /api/buildings/:id - Update building basic info
// ============================================================
app.put('/api/buildings/:id', (req, res) => {
  const db = getDb();
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });

  const fields = [
    'name', 'region', 'province', 'city', 'district', 'asset_type',
    'headcount', 'scale_tier', 'building_age', 'area_sqm', 'floors',
    'access_gates', 'business_lines', 'supplier', 'day1_date', 'energy_cost_budget'
  ];

  const sets = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (sets.length === 0) return res.json(building);

  sets.push("updated_at = datetime('now','localtime')");
  params.push(req.params.id);

  db.prepare(`UPDATE buildings SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ============================================================
// GET /api/buildings/:id/indicators - All indicators with values
// ============================================================
app.get('/api/buildings/:id/indicators', (req, res) => {
  const db = getDb();
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });

  const period = req.query.period || 'H1_2026';
  const prevPeriod = req.query.prev_period || 'H2_2025';

  // Get all indicators with their current and previous values
  const indicators = db.prepare(`
    SELECT i.*, d.name as dimension_name, d.poc,
           v1.actual_value, v1.notes, v1.is_applicable, v1.updated_at as value_updated_at,
           v2.actual_value as prev_value
    FROM indicators i
    JOIN dimensions d ON i.dimension_id = d.id
    LEFT JOIN indicator_values v1 ON i.id = v1.indicator_id
      AND v1.building_id = ? AND v1.period = ?
    LEFT JOIN indicator_values v2 ON i.id = v2.indicator_id
      AND v2.building_id = ? AND v2.period = ?
    ORDER BY d.sort_order, i.seq
  `).all(req.params.id, period, req.params.id, prevPeriod);

  // Calculate completion rate for each indicator
  const result = indicators.map(ind => ({
    ...ind,
    completion_rate: calcIndicatorRate({
      target_value: ind.target_value,
      target_type: ind.target_type
    }, ind.actual_value, ind.prev_value)
  }));

  // Calculate dimension-level rates
  const dimMap = {};
  for (const r of result) {
    if (!dimMap[r.dimension_id]) {
      dimMap[r.dimension_id] = {
        dimension_id: r.dimension_id,
        dimension_name: r.dimension_name,
        poc: r.poc,
        rates: [],
        indicators: []
      };
    }
    dimMap[r.dimension_id].rates.push(r.completion_rate);
    dimMap[r.dimension_id].indicators.push(r);
  }

  const dimensions = Object.values(dimMap).map(d => ({
    ...d,
    completion_rate: calcDimensionRate(d.rates),
    rates: undefined
  }));

  // Calculate overall completion rate
  const allDimRates = dimensions.map(d => d.completion_rate).filter(r => r != null);
  const overall_rate = allDimRates.length > 0
    ? Math.round(allDimRates.reduce((s, r) => s + r, 0) / allDimRates.length * 100) / 100
    : null;

  res.json({
    building_id: req.params.id,
    period,
    overall_rate,
    dimensions,
    indicators: result
  });
});

// ============================================================
// PUT /api/buildings/:id/indicators - Batch save indicator values
// ============================================================
app.put('/api/buildings/:id/indicators', (req, res) => {
  const db = getDb();
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });

  const { period, values } = req.body;
  if (!period || !Array.isArray(values)) {
    return res.status(400).json({ error: 'period and values[] required' });
  }

  const upsert = db.prepare(`
    INSERT INTO indicator_values (building_id, indicator_id, period, actual_value, is_applicable, notes, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(building_id, indicator_id, period)
    DO UPDATE SET actual_value = excluded.actual_value,
                  is_applicable = excluded.is_applicable,
                  notes = excluded.notes,
                  updated_by = excluded.updated_by,
                  updated_at = datetime('now','localtime')
  `);

  const tx = db.transaction(() => {
    for (const v of values) {
      upsert.run(
        req.params.id,
        v.indicator_id,
        period,
        v.actual_value ?? null,
        v.is_applicable !== undefined ? (v.is_applicable ? 1 : 0) : 1,
        v.notes || null,
        v.updated_by || null
      );
    }
  });
  tx();

  // Return the updated indicators
  const indicators = db.prepare(`
    SELECT i.*, d.name as dimension_name,
           v.actual_value, v.notes, v.is_applicable, v.updated_at as value_updated_at
    FROM indicators i
    JOIN dimensions d ON i.dimension_id = d.id
    LEFT JOIN indicator_values v ON i.id = v.indicator_id
      AND v.building_id = ? AND v.period = ?
    ORDER BY d.sort_order, i.seq
  `).all(req.params.id, period);

  const result = indicators.map(ind => ({
    ...ind,
    completion_rate: calcIndicatorRate({
      target_value: ind.target_value,
      target_type: ind.target_type
    }, ind.actual_value, null)
  }));

  res.json({ success: true, period, indicators: result });
});

// ============================================================
// GET /api/buildings/:id/measures - Building measures
// ============================================================
app.get('/api/buildings/:id/measures', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = 'SELECT * FROM measures WHERE building_id = ?';
  const params = [req.params.id];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const measures = db.prepare(sql).all(...params);
  res.json(measures);
});

// ============================================================
// PUT /api/buildings/:id/measures/:mid - Update a measure
// ============================================================
app.put('/api/buildings/:id/measures/:mid', (req, res) => {
  const db = getDb();
  const measure = db.prepare(
    'SELECT * FROM measures WHERE id = ? AND building_id = ?'
  ).get(req.params.mid, req.params.id);
  if (!measure) return res.status(404).json({ error: 'Measure not found' });

  const fields = [
    'name', 'status', 'dimension_ids', 'indicator_ids', 'description',
    'completion_phase', 'planned_end_date', 'actual_end_date', 'budget',
    'expected_effect', 'effect_validation'
  ];

  const sets = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (sets.length === 0) return res.json(measure);

  sets.push("updated_at = datetime('now','localtime')");
  params.push(req.params.mid);

  db.prepare(`UPDATE measures SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM measures WHERE id = ?').get(req.params.mid);
  res.json(updated);
});

// ============================================================
// GET /api/measures - List all measures with building info
// ============================================================
app.get('/api/measures', (req, res) => {
  const db = getDb();
  const { status, dimension_id, building_id, region, limit } = req.query;

  let sql = `SELECT m.*, b.name as building_name, b.region, b.city, b.asset_type
             FROM measures m JOIN buildings b ON m.building_id = b.id WHERE 1=1`;
  const params = [];

  if (status) {
    sql += ' AND m.status = ?';
    params.push(status);
  }
  if (dimension_id) {
    sql += " AND (m.dimension_ids = ? OR m.dimension_ids LIKE ? OR m.dimension_ids LIKE ? OR m.dimension_ids LIKE ?)";
    params.push(dimension_id, dimension_id + ',%', '%,' + dimension_id, '%,' + dimension_id + ',%');
  }
  if (building_id) {
    sql += ' AND m.building_id = ?';
    params.push(building_id);
  }
  if (region) {
    sql += ' AND b.region = ?';
    params.push(region);
  }

  sql += ' ORDER BY m.created_at DESC';

  if (limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(limit));
  }

  const measures = db.prepare(sql).all(...params);
  res.json(measures);
});

// ============================================================
// GET /api/overview - National overview aggregated data
// ============================================================
app.get('/api/overview', (req, res) => {
  const db = getDb();
  const period = req.query.period || 'H1_2026';
  const prevPeriod = req.query.prev_period || 'H2_2025';
  const { region, asset_type } = req.query;

  // Building filter
  let bWhere = 'WHERE 1=1';
  const bParams = [];
  if (region) { bWhere += ' AND region = ?'; bParams.push(region); }
  if (asset_type) { bWhere += ' AND asset_type = ?'; bParams.push(asset_type); }

  // Building counts
  const totalBuildings = db.prepare(`SELECT COUNT(*) as cnt FROM buildings ${bWhere}`).get(...bParams).cnt;
  const selfBuilt = db.prepare(`SELECT COUNT(*) as cnt FROM buildings ${bWhere} AND asset_type = '自持园区'`).get(...bParams).cnt;
  const leased = db.prepare(`SELECT COUNT(*) as cnt FROM buildings ${bWhere} AND asset_type = '租赁职场'`).get(...bParams).cnt;

  // Dimension completion rates per building
  const allIndicators = db.prepare('SELECT * FROM indicators ORDER BY dimension_id, seq').all();
  const dimDefs = db.prepare('SELECT * FROM dimensions ORDER BY sort_order').all();
  const buildings = db.prepare(`SELECT * FROM buildings ${bWhere} ORDER BY id`).all(...bParams);

  // Get all values for current period
  const allValues = db.prepare(`
    SELECT iv.* FROM indicator_values iv
    JOIN buildings b ON iv.building_id = b.id
    ${bWhere.replace('WHERE', 'AND')} AND iv.period = ?
  `).all(...bParams, period);

  const prevValues = db.prepare(`
    SELECT iv.* FROM indicator_values iv
    JOIN buildings b ON iv.building_id = b.id
    ${bWhere.replace('WHERE', 'AND')} AND iv.period = ?
  `).all(...bParams, prevPeriod);

  // Index values by building_id + indicator_id
  const valIdx = {};
  for (const v of allValues) valIdx[`${v.building_id}_${v.indicator_id}`] = v;
  const prevIdx = {};
  for (const v of prevValues) prevIdx[`${v.building_id}_${v.indicator_id}`] = v;

  // Calculate overall stats
  let totalFilledValues = 0;
  let totalPossibleValues = 0;
  const dimRatesMap = {}; // dim_id -> [rates]
  const buildingRates = []; // { building_id, overall_rate }
  const buildingDimRates = []; // { building_id, dim_id, rate }

  // Pre-fetch measures count per building
  const measuresMap = {};
  const mCounts = db.prepare(`SELECT building_id, COUNT(*) as cnt FROM measures GROUP BY building_id`).all();
  for (const m of mCounts) measuresMap[m.building_id] = m.cnt;

  for (const b of buildings) {
    const bRates = [];
    const bPrevRates = [];
    let failingDims = 0;
    for (const d of dimDefs) {
      const dIndicators = allIndicators.filter(i => i.dimension_id === d.id);
      const dRates = [];
      const dPrevRates = [];
      for (const ind of dIndicators) {
        const v = valIdx[`${b.id}_${ind.id}`];
        const pv = prevIdx[`${b.id}_${ind.id}`];
        if (v && v.actual_value != null) totalFilledValues++;
        totalPossibleValues++;
        const rate = calcIndicatorRate(
          { target_value: ind.target_value, target_type: ind.target_type },
          v ? v.actual_value : null,
          pv ? pv.actual_value : null
        );
        dRates.push(rate);
        // Previous period rate (purely from prev values, no trend reference)
        const prevRate = calcIndicatorRate(
          { target_value: ind.target_value, target_type: ind.target_type },
          pv ? pv.actual_value : null,
          null
        );
        dPrevRates.push(prevRate);
      }
      const dimRate = calcDimensionRate(dRates);
      const dimPrevRate = calcDimensionRate(dPrevRates);
      if (!dimRatesMap[d.id]) dimRatesMap[d.id] = [];
      dimRatesMap[d.id].push(dimRate);
      bRates.push(dimRate);
      bPrevRates.push(dimPrevRate);
      buildingDimRates.push({ building_id: b.id, dim_id: d.id, rate: dimRate });
      if (dimRate != null && dimRate < 100) failingDims++;
    }
    const overall = calcDimensionRate(bRates);
    const prevOverall = calcDimensionRate(bPrevRates);
    buildingRates.push({
      building_id: b.id, name: b.name, region: b.region, city: b.city,
      asset_type: b.asset_type, headcount: b.headcount, scale_tier: b.scale_tier,
      overall_rate: overall, prev_rate: prevOverall, failing_dim_count: failingDims,
      measures_count: measuresMap[b.id] || 0
    });
  }

  // Dimension averages (current + previous)
  const prevDimRatesMap = {};
  const dimensionRates = dimDefs.map(d => {
    // Collect previous period dim rates
    const prevRates = buildingDimRates
      .filter(bdr => bdr.dim_id === d.id)
      .map(bdr => {
        const b = buildings.find(x => x.id === bdr.building_id);
        if (!b) return null;
        const dIndicators = allIndicators.filter(i => i.dimension_id === d.id);
        const dPrevRates = [];
        for (const ind of dIndicators) {
          const pv = prevIdx[`${b.id}_${ind.id}`];
          const prevRate = calcIndicatorRate(
            { target_value: ind.target_value, target_type: ind.target_type },
            pv ? pv.actual_value : null,
            null
          );
          dPrevRates.push(prevRate);
        }
        return calcDimensionRate(dPrevRates);
      }).filter(r => r != null);
    prevDimRatesMap[d.id] = prevRates;
    return {
      dimension_id: d.id,
      name: d.name,
      completion_rate: calcDimensionRate(dimRatesMap[d.id] || [])
    };
  });

  const prevDimensionRates = dimDefs.map(d => ({
    dimension_id: d.id,
    name: d.name,
    completion_rate: calcDimensionRate(prevDimRatesMap[d.id] || [])
  }));

  // Overall rate
  const allDimAvgRates = dimensionRates.map(d => d.completion_rate).filter(r => r != null);
  const overallRate = allDimAvgRates.length > 0
    ? Math.round(allDimAvgRates.reduce((s, r) => s + r, 0) / allDimAvgRates.length * 100) / 100
    : null;

  // Data fill rate
  const fillRate = totalPossibleValues > 0
    ? Math.round(totalFilledValues / totalPossibleValues * 10000) / 100
    : 0;

  // Not-passing buildings
  const notPassing = buildingRates.filter(b => b.overall_rate != null && b.overall_rate < 100).length;

  // Previous period overall rate (for trend display)
  const prevRates = buildingRates.map(b => b.prev_rate).filter(r => r != null);
  const prevOverallRate = prevRates.length > 0
    ? Math.round(prevRates.reduce((s, r) => s + r, 0) / prevRates.length * 100) / 100
    : null;

  // Measures summary
  let mWhere = 'WHERE 1=1';
  const mParams = [];
  if (region || asset_type) {
    mWhere = `WHERE b.region ${region ? '= ?' : 'IS NOT NULL'} ${asset_type ? 'AND b.asset_type = ?' : ''}`;
    if (region) mParams.push(region);
    if (asset_type) mParams.push(asset_type);
  }
  const measureStats = db.prepare(`
    SELECT m.status, COUNT(*) as cnt FROM measures m
    JOIN buildings b ON m.building_id = b.id
    ${mWhere}
    GROUP BY m.status
  `).all(...mParams);

  res.json({
    period,
    prev_period: prevPeriod,
    total_buildings: totalBuildings,
    self_built: selfBuilt,
    leased,
    overall_rate: overallRate,
    prev_overall_rate: prevOverallRate,
    fill_rate: fillRate,
    filled_values: totalFilledValues,
    total_possible: totalPossibleValues,
    not_passing_count: notPassing,
    measure_stats: measureStats,
    dimension_rates: dimensionRates,
    prev_dimension_rates: prevDimensionRates,
    building_rates: buildingRates,
    building_dim_rates: buildingDimRates
  });
});

// ============================================================
// GET /api/regions/:region_id - Region drill-down data
// ============================================================
app.get('/api/regions/:region_id', (req, res) => {
  const db = getDb();
  const period = req.query.period || 'H1_2026';
  const prevPeriod = req.query.prev_period || 'H2_2025';
  const regionId = req.params.region_id;

  // Forward to overview with region filter
  const overview = db.prepare('SELECT COUNT(*) as cnt FROM buildings WHERE region = ?').get(regionId);
  if (overview.cnt === 0) return res.status(404).json({ error: 'Region not found' });

  // Reuse overview query pattern but scoped to region
  const allIndicators = db.prepare('SELECT * FROM indicators ORDER BY dimension_id, seq').all();
  const dimDefs = db.prepare('SELECT * FROM dimensions ORDER BY sort_order').all();
  const buildings = db.prepare('SELECT * FROM buildings WHERE region = ? ORDER BY id').all(regionId);

  const allValues = db.prepare(`
    SELECT iv.* FROM indicator_values iv
    JOIN buildings b ON iv.building_id = b.id
    WHERE b.region = ? AND iv.period = ?
  `).all(regionId, period);

  const prevValues = db.prepare(`
    SELECT iv.* FROM indicator_values iv
    JOIN buildings b ON iv.building_id = b.id
    WHERE b.region = ? AND iv.period = ?
  `).all(regionId, prevPeriod);

  const valIdx = {};
  for (const v of allValues) valIdx[`${v.building_id}_${v.indicator_id}`] = v;
  const prevIdx = {};
  for (const v of prevValues) prevIdx[`${v.building_id}_${v.indicator_id}`] = v;

  const dimRatesMap = {};
  const buildingRates = [];
  const buildingDimRates = [];
  let totalFilled = 0, totalPossible = 0;

  // Measures count per building
  const measuresMap = {};
  const mCounts = db.prepare(`SELECT building_id, COUNT(*) as cnt FROM measures m JOIN buildings b ON m.building_id = b.id WHERE b.region = ? GROUP BY m.building_id`).all(regionId);
  for (const m of mCounts) measuresMap[m.building_id] = m.cnt;

  for (const b of buildings) {
    const bRates = [];
    const bPrevRates = [];
    let failingDims = 0;
    for (const d of dimDefs) {
      const dIndicators = allIndicators.filter(i => i.dimension_id === d.id);
      const dRates = [];
      const dPrevRates = [];
      for (const ind of dIndicators) {
        const v = valIdx[`${b.id}_${ind.id}`];
        const pv = prevIdx[`${b.id}_${ind.id}`];
        if (v && v.actual_value != null) totalFilled++;
        totalPossible++;
        dRates.push(calcIndicatorRate(
          { target_value: ind.target_value, target_type: ind.target_type },
          v ? v.actual_value : null,
          pv ? pv.actual_value : null
        ));
        dPrevRates.push(calcIndicatorRate(
          { target_value: ind.target_value, target_type: ind.target_type },
          pv ? pv.actual_value : null,
          null
        ));
      }
      const dimRate = calcDimensionRate(dRates);
      const dimPrevRate = calcDimensionRate(dPrevRates);
      if (!dimRatesMap[d.id]) dimRatesMap[d.id] = [];
      dimRatesMap[d.id].push(dimRate);
      buildingDimRates.push({ building_id: b.id, dim_id: d.id, rate: dimRate });
      bRates.push(dimRate);
      bPrevRates.push(dimPrevRate);
      if (dimRate != null && dimRate < 100) failingDims++;
    }
    const overall = calcDimensionRate(bRates);
    const prevOverall = calcDimensionRate(bPrevRates);
    buildingRates.push({
      building_id: b.id, name: b.name, region: b.region, city: b.city,
      asset_type: b.asset_type, headcount: b.headcount, scale_tier: b.scale_tier,
      overall_rate: overall, prev_rate: prevOverall, failing_dim_count: failingDims,
      measures_count: measuresMap[b.id] || 0
    });
  }

  const dimensionRates = dimDefs.map(d => ({
    dimension_id: d.id,
    name: d.name,
    completion_rate: calcDimensionRate(dimRatesMap[d.id] || [])
  }));

  const allDimAvgRates = dimensionRates.map(d => d.completion_rate).filter(r => r != null);
  const overallRate = allDimAvgRates.length > 0
    ? Math.round(allDimAvgRates.reduce((s, r) => s + r, 0) / allDimAvgRates.length * 100) / 100
    : null;

  const selfBuilt = buildings.filter(b => b.asset_type === '自持园区').length;
  const notPassing = buildingRates.filter(b => b.overall_rate != null && b.overall_rate < 100).length;

  // Previous period overall rate (for trend display)
  const prevRates = buildingRates.map(b => b.prev_rate).filter(r => r != null);
  const prevOverallRate = prevRates.length > 0
    ? Math.round(prevRates.reduce((s, r) => s + r, 0) / prevRates.length * 100) / 100
    : null;

  const measureStats = db.prepare(`
    SELECT m.status, COUNT(*) as cnt FROM measures m
    JOIN buildings b ON m.building_id = b.id
    WHERE b.region = ? GROUP BY m.status
  `).all(regionId);

  res.json({
    region_id: regionId,
    period,
    prev_period: prevPeriod,
    total_buildings: buildings.length,
    self_built: selfBuilt,
    leased: buildings.length - selfBuilt,
    overall_rate: overallRate,
    prev_overall_rate: prevOverallRate,
    fill_rate: totalPossible > 0 ? Math.round(totalFilled / totalPossible * 10000) / 100 : 0,
    filled_values: totalFilled,
    total_possible: totalPossible,
    not_passing_count: notPassing,
    measure_stats: measureStats,
    dimension_rates: dimensionRates,
    building_rates: buildingRates,
    building_dim_rates: buildingDimRates
  });
});

// ============================================================
// POST /api/measures - Create a new measure
// ============================================================
app.post('/api/measures', (req, res) => {
  const db = getDb();
  const { building_id, name, status, dimension_ids, indicator_ids, description,
          completion_phase, planned_end_date, budget, expected_effect } = req.body;

  if (!building_id || !name) {
    return res.status(400).json({ error: 'building_id and name are required' });
  }

  const result = db.prepare(`
    INSERT INTO measures (building_id, name, status, dimension_ids, indicator_ids,
      description, completion_phase, planned_end_date, budget, expected_effect)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    building_id, name, status || '未开始', dimension_ids || null, indicator_ids || null,
    description || null, completion_phase || null, planned_end_date || null,
    budget || null, expected_effect || null
  );

  const created = db.prepare('SELECT * FROM measures WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// ============================================================
// GET /api/dimensions/stats - Dimension stats across buildings
// ============================================================
app.get('/api/dimensions/stats', (req, res) => {
  const db = getDb();
  const period = req.query.period || 'H1_2026';
  const prevPeriod = req.query.prev_period || 'H2_2025';

  const dimDefs = db.prepare('SELECT * FROM dimensions ORDER BY sort_order').all();
  const allIndicators = db.prepare('SELECT * FROM indicators ORDER BY dimension_id, seq').all();
  const buildings = db.prepare('SELECT * FROM buildings ORDER BY id').all();
  const allValues = db.prepare('SELECT * FROM indicator_values WHERE period = ?').all(period);
  const prevValues = db.prepare('SELECT * FROM indicator_values WHERE period = ?').all(prevPeriod);

  const valByIdx = {};
  for (const v of allValues) valByIdx[`${v.building_id}_${v.indicator_id}`] = v;
  const prevByIdx = {};
  for (const v of prevValues) prevByIdx[`${v.building_id}_${v.indicator_id}`] = v;

  const stats = dimDefs.map(d => {
    const rates = [];
    for (const b of buildings) {
      const dIndicators = allIndicators.filter(i => i.dimension_id === d.id);
      const dRates = [];
      for (const ind of dIndicators) {
        const v = valByIdx[`${b.id}_${ind.id}`];
        const pv = prevByIdx[`${b.id}_${ind.id}`];
        dRates.push(calcIndicatorRate(
          { target_value: ind.target_value, target_type: ind.target_type },
          v ? v.actual_value : null,
          pv ? pv.actual_value : null
        ));
      }
      rates.push(calcDimensionRate(dRates));
    }
    return {
      dimension_id: d.id,
      name: d.name,
      avg_rate: calcDimensionRate(rates),
      passing_count: rates.filter(r => r != null && r >= 100).length,
      total_count: rates.filter(r => r != null).length
    };
  });

  res.json(stats);
});

app.listen(PORT, () => {
  console.log(`Building Profile API running on http://localhost:${PORT}`);
});
