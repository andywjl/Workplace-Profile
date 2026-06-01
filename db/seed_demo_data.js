// ============================================================
// Seed demo indicator values for showcase
// ============================================================
const { getDb } = require('./init');

const db = getDb();
const PERIOD = 'H1_2026';
const PREV_PERIOD = 'H2_2025';

// Get all data
const buildings = db.prepare('SELECT * FROM buildings').all();
const indicators = db.prepare('SELECT * FROM indicators').all();
const dimDefs = db.prepare('SELECT * FROM dimensions ORDER BY sort_order').all();

// Parse target number from target_value string
function parseTarget(targetStr) {
  if (!targetStr || targetStr === '—') return null;
  const cleaned = targetStr
    .replace(/^[≤≥<>]\s*/, '')
    .replace(/:.*$/, '')
    .replace(/%$/, '')
    .replace(/[^0-9.]/g, '')
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || cleaned === '' ? null : n;
}

// Generate a realistic value based on target and target_type
function genValue(ind, quality) {
  // quality: 0.0 = worst, 1.0 = best (always passing)
  const target = parseTarget(ind.target_value);
  const type = ind.target_type;

  if (target == null) {
    // No numeric target, generate a reasonable default
    return Math.round(50 + quality * 50);
  }

  const variance = (1 - quality) * 0.3; // 0-30% deviation

  if (type === 'upper') {
    // Actual should be ≤ target. Lower quality = overshoot
    return target * (1 + variance * (Math.random() * 2));
  }
  if (type === 'lower') {
    // Actual should be ≥ target. Lower quality = undershoot
    return target * (1 - variance * (Math.random() * 2));
  }
  if (type === 'fixed') {
    return quality > 0.85 ? target : target + (Math.random() > 0.5 ? 1 : -1);
  }
  if (type === 'trend') {
    return Math.round(30 + quality * 70);
  }
  return Math.round(50 + quality * 50);
}

// Assign quality levels per building to create realistic variation
// Self-owned campuses: generally good (0.7-1.0)
// Leased buildings: mixed (0.3-0.9)
function buildingQuality(building) {
  const selfOwnedHigh = ['大钟寺广场', '成都桂溪广场', '上海新江湾广场'];
  const selfOwnedMedium = ['深圳景湖大厦', '杭州仓南广场', '北京方恒中心'];

  if (selfOwnedHigh.includes(building.name)) return 0.85 + Math.random() * 0.15;
  if (selfOwnedMedium.includes(building.name)) return 0.65 + Math.random() * 0.2;

  // Leased buildings: random quality
  const hash = building.name.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const base = (hash % 40) / 100 + 0.3; // 0.3 - 0.7 range
  return base + Math.random() * 0.2;
}

// Dimension quality modifiers (D15-D18 are the most important, slightly harder)
function dimQualityMod(dimId) {
  const harder = ['D15', 'D17', 'D18']; // 环境安全, 照明亮堂, 空气清新 are harder
  if (harder.includes(dimId)) return -0.1;
  if (dimId === 'D10') return 0.15; // 物流通畅 is easier
  return 0;
}

const upsert = db.prepare(`
  INSERT INTO indicator_values (building_id, indicator_id, period, actual_value, is_applicable, notes)
  VALUES (?, ?, ?, ?, 1, NULL)
  ON CONFLICT(building_id, indicator_id, period)
  DO UPDATE SET actual_value = excluded.actual_value
`);

// Seed ALL buildings
const targetBuildings = buildings;

console.log(`Generating demo data for ${targetBuildings.length} buildings...`);

const tx = db.transaction(() => {
  for (const b of targetBuildings) {
    const baseQuality = buildingQuality(b);

    for (const ind of indicators) {
      // Skip some indicators randomly for variety (10% chance of NULL)
      if (Math.random() < 0.1) continue;

      const qMod = dimQualityMod(ind.dimension_id);
      const quality = Math.max(0.1, Math.min(1.0, baseQuality + qMod + (Math.random() * 0.1 - 0.05)));

      const h1Value = genValue(ind, quality);
      // H2 2025 value: slightly worse to show improvement trend
      const prevQuality = Math.max(0.1, quality - 0.03 - Math.random() * 0.05);
      const h2Value = genValue(ind, prevQuality);

      upsert.run(b.id, ind.id, PERIOD, Math.round(h1Value * 100) / 100);
      upsert.run(b.id, ind.id, PREV_PERIOD, Math.round(h2Value * 100) / 100);
    }
  }
});

tx();

// Count inserted
const count = db.prepare('SELECT COUNT(*) as cnt FROM indicator_values').get();
console.log(`Total indicator values: ${count.cnt}`);
console.log(`H1_2026: ${db.prepare("SELECT COUNT(*) as cnt FROM indicator_values WHERE period = 'H1_2026'").get().cnt}`);
console.log(`H2_2025: ${db.prepare("SELECT COUNT(*) as cnt FROM indicator_values WHERE period = 'H2_2025'").get().cnt}`);

// Show sample building rates
const sampleBld = buildings.find(b => b.asset_type === '自持园区');
const dimRates = db.prepare(`
  SELECT d.name, AVG(
    CASE WHEN i.target_type = 'upper' THEN
      CASE WHEN v.actual_value <= CAST(REPLACE(REPLACE(REPLACE(i.target_value,'≤',''),'≥',''),':1','') AS REAL) THEN 100
      ELSE CAST(REPLACE(REPLACE(REPLACE(i.target_value,'≤',''),'≥',''),':1','') AS REAL) / v.actual_value * 100 END
    ELSE 50 END
  ) as rate
  FROM indicators i
  JOIN indicator_values v ON i.id = v.indicator_id
  JOIN dimensions d ON i.dimension_id = d.id
  WHERE v.building_id = ? AND v.period = ?
  GROUP BY d.id ORDER BY d.sort_order
`).all(sampleBld.id, PERIOD);

console.log(`\nSample rates for ${sampleBld.name}:`);
dimRates.forEach(d => console.log(`  ${d.name}: ${d.rate != null ? Math.round(d.rate) + '%' : '--'}`));

db.close();
console.log('\nDemo data seed complete!');
