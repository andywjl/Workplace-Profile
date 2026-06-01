// Seed improvement measures from JSON export
const { getDb } = require('./init');
const path = require('path');
const fs = require('fs');

const db = getDb();

// Only seed if measures table is empty
const count = db.prepare('SELECT COUNT(*) as cnt FROM measures').get();
if (count.cnt > 0) {
  console.log(`Measures already seeded (${count.cnt} records).`);
  return;
}

const dataPath = path.join(__dirname, 'measures_seed.json');
if (!fs.existsSync(dataPath)) {
  console.log('measures_seed.json not found, skipping measures seed.');
  return;
}

const measures = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
console.log(`Seeding ${measures.length} measures...`);

// Build name → id map
const buildings = db.prepare('SELECT id, name FROM buildings').all();
const nameToId = {};
for (const b of buildings) nameToId[b.name] = b.id;

const insert = db.prepare(`
  INSERT INTO measures (building_id, name, status, dimension_ids, description, completion_phase, budget, expected_effect)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let inserted = 0;
let skipped = 0;
const tx = db.transaction(() => {
  for (const m of measures) {
    const bid = nameToId[m.building_name];
    if (!bid) {
      skipped++;
      continue;
    }
    insert.run(bid, m.name, m.status, m.dimension_ids, m.description, m.completion_phase, m.budget, m.expected_effect);
    inserted++;
  }
});
tx();

console.log(`Seeded ${inserted} measures (${skipped} skipped).`);
