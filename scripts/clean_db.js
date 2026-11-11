const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

// 1. Copy server/data/minimi.db to ./data/minimi.db
if (fs.existsSync('./server/data/minimi.db')) {
  fs.copyFileSync('./server/data/minimi.db', './data/minimi.db');
  console.log('Copied server/data/minimi.db to ./data/minimi.db');
}

for (const p of ['./data/minimi.db', './server/data/minimi.db']) {
  if (!fs.existsSync(p)) continue;
  console.log('Cleaning', p);
  const db = new DatabaseSync(p);

  // 1. Delete corrupted assistant echo specs
  db.exec("DELETE FROM memories WHERE predicate = 'specs' AND (value LIKE '%ific%' OR value LIKE '%requirement%' OR value = 's')");

  // 2. Fix location value
  db.exec("UPDATE memories SET value = 'Bengaluru' WHERE predicate = 'location' AND value LIKE '%Bengaluru%'");

  // 3. Strip trailing commas/periods from all memory values
  const allMems = db.prepare('SELECT id, value FROM memories').all();
  const updateVal = db.prepare('UPDATE memories SET value = ? WHERE id = ?');
  for (const m of allMems) {
    const cleaned = m.value.replace(/^[,\s;:]+|[,\s;:]+$/g, '').trim();
    if (cleaned !== m.value) {
      updateVal.run(cleaned, m.id);
    }
  }

  // 4. Ensure proper chronological superseding for (subject, predicate)
  const distinctPairs = db.prepare('SELECT DISTINCT subject, predicate FROM memories').all();
  for (const pair of distinctPairs) {
    const records = db.prepare('SELECT id, valid_from, recorded_at FROM memories WHERE subject = ? AND predicate = ? ORDER BY recorded_at ASC').all(pair.subject, pair.predicate);
    if (records.length > 1) {
      // Loop through up to n-1 and ensure valid_until is set
      for (let i = 0; i < records.length - 1; i++) {
        const nextValidFrom = records[i + 1].valid_from || records[i + 1].recorded_at;
        db.prepare('UPDATE memories SET valid_until = ? WHERE id = ? AND (valid_until IS NULL OR valid_until > ?)').run(nextValidFrom, records[i].id, nextValidFrom);
      }
      // Ensure only the latest record has valid_until IS NULL
      db.prepare('UPDATE memories SET valid_until = NULL WHERE id = ?').run(records[records.length - 1].id);
    }
  }

  // 5. Rebuild memory_fts
  db.exec('DELETE FROM memory_fts');
  db.exec("INSERT INTO memory_fts (memory_id, subject, predicate, value, category, full_text) SELECT id, subject, predicate, value, category, subject || ' ' || predicate || ' ' || value || ' ' || category FROM memories");

  const count = db.prepare('SELECT count(*) as c FROM memories').get();
  console.log('Memories count after cleanup in ' + p + ':', count);
}
