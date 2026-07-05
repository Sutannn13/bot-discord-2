const MAX_LEVEL = 100;

// ── KURVA: satu-satunya tempat bentuk kurva didefinisikan (flat 100/level) ──
function xpToNext(level) { return 100; }
function xpForLevel(level) { return 100 * level; }
// ───────────────────────────────────────────────────────────────────────────

// Total XP -> level saat ini (di-cap MAX_LEVEL)
function levelForXp(totalXp) {
  let level = 0;
  while (level < MAX_LEVEL && totalXp >= xpForLevel(level + 1)) level++;
  return level;
}

// Progress di dalam level saat ini (buat progress bar di /rank)
function progress(totalXp) {
  const level = levelForXp(totalXp);
  if (level >= MAX_LEVEL) {
    // ponytail: level maxed — ga ada next level; need:0 + flag max, /rank render "MAX".
    return { level, into: totalXp - xpForLevel(MAX_LEVEL), need: 0, max: true };
  }
  return { level, into: totalXp - xpForLevel(level), need: xpToNext(level), max: false };
}

module.exports = { xpToNext, xpForLevel, levelForXp, progress, MAX_LEVEL };

// self-check: jalankan `node src/level.js`
if (require.main === module) {
  const assert = require('assert');
  // invariant curve-agnostic: xpForLevel(l) + xpToNext(l) === xpForLevel(l+1)
  assert.strictEqual(xpForLevel(0), 0);
  for (let l = 0; l < MAX_LEVEL; l++)
    assert.strictEqual(xpForLevel(l) + xpToNext(l), xpForLevel(l + 1));
  // flat 100/level
  assert.strictEqual(xpForLevel(1), 100);
  assert.strictEqual(xpForLevel(100), 10000);
  assert.strictEqual(levelForXp(0), 0);
  assert.strictEqual(levelForXp(99), 0);
  assert.strictEqual(levelForXp(100), 1);
  assert.strictEqual(levelForXp(10000), 100);
  assert.strictEqual(levelForXp(9_999_999), 100); // cap nahan
  const p = progress(150);          // L1, into 50, need 100
  assert.strictEqual(p.level, 1);
  assert.strictEqual(p.into, 50);
  assert.strictEqual(p.need, 100);
  const m = progress(10000);        // maxed
  assert.strictEqual(m.level, 100);
  assert.strictEqual(m.max, true);
  assert.strictEqual(m.need, 0);
  console.log('level.js self-check passed');
}
