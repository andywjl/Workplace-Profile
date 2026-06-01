// ============================================================
// Import improvement measures from CSV files
// ============================================================
const fs = require('fs');
const path = require('path');
const { getDb } = require('./init');

const db = getDb();

// Dimension name → ID mapping
const DIM_MAP = {
  '环境安全': 'D15', '温度适宜': 'D16', '照明亮堂': 'D17', '空气清新': 'D18',
  '空间合理': 'D01', '业务连续': 'D02', '标识清晰': 'D03', '通行有序': 'D04',
  '喝水方便': 'D05', '厕所干净': 'D06', '噪音无扰': 'D07', '物资齐备': 'D08',
  '乘梯有速': 'D09', '物流通畅': 'D10', '节能降耗': 'D11', '及时响应': 'D12',
  '设施完善': 'D13', '技术先进': 'D14',
};

// Phase → completion_phase mapping
function normalizePhase(raw) {
  const s = (raw || '').trim();
  if (s.includes('1个月') || s.includes('3个月')) return '3个月内';
  if (s.includes('6个月') || s.includes('半年')) return '6个月内';
  if (s.includes('1年') || s.includes('一年') || s.includes('12个月')) return '1年内';
  if (s.includes('2年') || s.includes('长期')) return '1年以上';
  return s || null;
}

// Extract budget from resource string
function extractBudget(raw) {
  if (!raw || raw === '/' || raw === '待评估' || raw === '-') return null;
  const s = raw.replace(/[",]/g, '').trim();
  // Match patterns like "7.5万元", "33万", "18.2万元"
  let m = s.match(/([\d,.]+)\s*万/);
  if (m) return parseFloat(m[1].replace(/,/g, '')) * 10000;
  m = s.match(/([\d,.]+)\s*元/);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = s.match(/([\d,.]+)\s*亿/);
  if (m) return parseFloat(m[1].replace(/,/g, '')) * 100000000;
  return null;
}

// Load all buildings for name matching
const buildings = db.prepare('SELECT id, name FROM buildings').all();

// Campus short name → full name mapping
const CAMPUS_MAP = {
  '新江湾': '上海新江湾广场',
  '大钟寺': '大钟寺广场',
  '方恒': '北京方恒中心',
  '景湖': '深圳景湖大厦',
  '桂溪': '成都桂溪广场',
  '仓南': '杭州仓南广场',
};

// Build name matching index
function findBuilding(csvName) {
  const name = csvName.trim();

  // Check campus short name map first
  if (CAMPUS_MAP[name]) {
    const fullName = CAMPUS_MAP[name];
    const b = buildings.find(x => x.name === fullName);
    if (b) return b.id;
  }

  // Direct match
  let b = buildings.find(x => x.name === name);
  if (b) return b.id;

  // Contains match (CSV name is substring of full name)
  let matches = buildings.filter(x => x.name.includes(name));
  if (matches.length === 1) return matches[0].id;

  // Reverse contains (full name is substring of CSV name)
  matches = buildings.filter(x => name.includes(x.name));
  if (matches.length === 1) return matches[0].id;

  // Fuzzy: extract key characters for matching
  const keyChars = name.replace(/[市省区县\-·\s]/g, '');
  if (keyChars.length >= 2) {
    matches = buildings.filter(x => x.name.includes(keyChars));
    if (matches.length === 1) return matches[0].id;
    for (let len = keyChars.length; len >= 2; len--) {
      const prefix = keyChars.substring(0, len);
      matches = buildings.filter(x => x.name.includes(prefix));
      if (matches.length === 1) return matches[0].id;
    }
  }

  return null;
}

// Parse CSV with BOM handling
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV parse: split by comma, but respect quotes
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    // Remove BOM from first col
    if (cols[0]) cols[0] = cols[0].replace(/^﻿/, '');
    rows.push(cols);
  }
  return rows;
}

// Clear existing measures
db.exec('DELETE FROM measures');

const insertMeasure = db.prepare(`
  INSERT INTO measures (building_id, name, status, dimension_ids, description, completion_phase, budget, expected_effect)
  VALUES (?, ?, '未开始', ?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;
const skipLog = [];

function importFile(filePath, isCampus) {
  const rows = parseCSV(filePath);
  console.log(`\nProcessing: ${path.basename(filePath)} (${rows.length} rows)`);

  for (const row of rows) {
    const csvName = isCampus ? (row[0] || '') : (row[0] || '');
    // Campus CSV: col0=园区, col1=维度, col2=方案, col3=阶段, col4=标准, col5=预算
    // Leased CSV:  col0=楼宇, col1=性质, col2=排序, col3=维度, col4=方案, col5=阶段, col6=标准, col7=预算
    const dimName = isCampus ? (row[1] || '') : (row[3] || '');
    const description = isCampus ? (row[2] || '') : (row[4] || '');
    const phase = isCampus ? (row[3] || '') : (row[5] || '');
    const criteria = isCampus ? (row[4] || '') : (row[6] || '');
    const budgetStr = isCampus ? (row[5] || '') : (row[7] || '');

    // Skip empty rows
    if (!csvName || !description) {
      skipped++;
      continue;
    }

    // Skip rows that look like continued descriptions (no building name)
    const buildingId = findBuilding(csvName);
    if (!buildingId) {
      // Try to find if this row's first column is actually a dimension name
      // (some CSV rows are malformed continuations)
      const dimId = DIM_MAP[csvName];
      if (dimId) {
        // This is likely a continuation row, skip for now
        skipped++;
        continue;
      }
      skipLog.push(`Building not found: "${csvName}"`);
      skipped++;
      continue;
    }

    const dimId = DIM_MAP[dimName];
    if (!dimId) {
      skipLog.push(`Dimension not found: "${dimName}" for "${csvName}"`);
      skipped++;
      continue;
    }

    const completionPhase = normalizePhase(phase);
    const budget = extractBudget(budgetStr);
    const effect = criteria && criteria !== '/' ? criteria : null;

    // Generate a short name for the measure
    const shortName = description.length > 60 ? description.substring(0, 58) + '…' : description;

    try {
      insertMeasure.run(buildingId, shortName, dimId, description, completionPhase, budget, effect);
      imported++;
    } catch (err) {
      skipLog.push(`Insert error for "${csvName}": ${err.message}`);
      skipped++;
    }
  }
}

// Import both files
const leasedFile = '/Users/bytedance/Downloads/园区差异分析 - 8-租赁楼宇改进措施 (3).csv';
const campusFile = '/Users/bytedance/Downloads/园区差异分析 - 8-园区改进措施.csv';

if (fs.existsSync(leasedFile)) {
  importFile(leasedFile, false);
} else {
  console.log('Leased measures file not found, checking alternatives...');
  // Try alternative filenames
  const dir = '/Users/bytedance/Downloads/';
  const files = fs.readdirSync(dir).filter(f => f.includes('租赁楼宇改进措施'));
  if (files.length > 0) {
    importFile(path.join(dir, files[0]), false);
  }
}

if (fs.existsSync(campusFile)) {
  importFile(campusFile, true);
} else {
  console.log('Campus measures file not found, checking alternatives...');
  const dir = '/Users/bytedance/Downloads/';
  const files = fs.readdirSync(dir).filter(f => f.includes('园区改进措施'));
  if (files.length > 0) {
    importFile(path.join(dir, files[0]), true);
  }
}

console.log(`\n=== Import Summary ===`);
console.log(`Imported: ${imported}`);
console.log(`Skipped: ${skipped}`);
if (skipLog.length > 0 && skipLog.length <= 20) {
  console.log(`\nSkipped details:`);
  skipLog.forEach(l => console.log(`  ${l}`));
} else if (skipLog.length > 20) {
  console.log(`\nFirst 20 skipped:`);
  skipLog.slice(0, 20).forEach(l => console.log(`  ${l}`));
  console.log(`  ... and ${skipLog.length - 20} more`);
}

// Show stats
const stats = db.prepare('SELECT status, COUNT(*) as cnt FROM measures GROUP BY status').all();
console.log(`\nMeasures by status:`);
stats.forEach(s => console.log(`  ${s.status}: ${s.cnt}`));

const bldWithMeasures = db.prepare('SELECT COUNT(DISTINCT building_id) as cnt FROM measures').get();
console.log(`Buildings with measures: ${bldWithMeasures.cnt}`);

db.close();
