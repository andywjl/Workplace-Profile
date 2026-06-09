// Seed supplier data from JSON mapping
const { getDb } = require('./init');
const path = require('path');
const fs = require('fs');

const db = getDb();

// Check if suppliers already seeded
const count = db.prepare("SELECT COUNT(*) as cnt FROM buildings WHERE supplier IS NOT NULL AND supplier != ''").get();
if (count.cnt > 0) {
  console.log(`Suppliers already seeded (${count.cnt} buildings).`);
  return;
}

const dataPath = path.join(__dirname, 'supplier_data.json');
if (!fs.existsSync(dataPath)) {
  console.log('supplier_data.json not found, skipping supplier seed.');
  return;
}

const mapping = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
console.log(`Seeding ${Object.keys(mapping).length} supplier mappings...`);

const update = db.prepare('UPDATE buildings SET supplier = ? WHERE name = ?');
const tx = db.transaction(() => {
  for (const [name, supplier] of Object.entries(mapping)) {
    const result = update.run(supplier, name);
    if (result.changes === 0) {
      // Try partial match
      const bld = db.prepare('SELECT id, name FROM buildings WHERE name LIKE ?').get(`%${name}%`);
      if (bld) update.run(supplier, bld.name);
    }
  }
});
tx();

const finalCount = db.prepare("SELECT COUNT(*) as cnt FROM buildings WHERE supplier IS NOT NULL AND supplier != ''").get();
console.log(`Supplier seed complete: ${finalCount.cnt} buildings updated.`);
