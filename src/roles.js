const { PermissionFlagsBits } = require('discord.js');
const { levelForXp } = require('./level');

// ── Tier tampilan: SATU sumber kebenaran buat siapa lihat apa ──
// Penting: ini cuma buat TAMPILAN (help, badge). Penegakan izin tiap command
// tetap granular & terpisah (kick butuh KickMembers, dst) — getTier ga melebarkan hak akses.
const TIERS = {
  owner: { key: 'owner', label: 'Owner', emoji: '👑', rank: 3 },
  admin: { key: 'admin', label: 'Admin', emoji: '🛡️', rank: 2 },
  mod: { key: 'mod', label: 'Moderator', emoji: '⚔️', rank: 1 },
  member: { key: 'member', label: 'Member', emoji: '👤', rank: 0 },
};

// member: GuildMember (punya .permissions & .guild). Balikin objek dari TIERS.
function getTier(member) {
  if (!member) return TIERS.member;
  const perms = member.permissions;
  if (member.id === member.guild?.ownerId || perms?.has(PermissionFlagsBits.Administrator))
    return TIERS.owner;
  if (perms?.has(PermissionFlagsBits.ManageGuild)) return TIERS.admin;
  if (
    perms?.has(PermissionFlagsBits.ModerateMembers) ||
    perms?.has(PermissionFlagsBits.KickMembers) ||
    perms?.has(PermissionFlagsBits.BanMembers)
  )
    return TIERS.mod;
  return TIERS.member;
}

// Gelar dari level_roles: nama role level TERTINGGI yang udah dicapai user.
// cfg.level_roles = { "5": "roleId", "15": "roleId", ... }. Balikin nama role atau null.
function titleForLevel(guild, cfg, totalXp) {
  if (!guild || !cfg?.level_roles) return null;
  const level = levelForXp(totalXp);
  let bestLevel = -1;
  let bestRoleId = null;
  for (const [lvlStr, roleId] of Object.entries(cfg.level_roles)) {
    const lvl = Number(lvlStr);
    if (Number.isFinite(lvl) && lvl <= level && lvl > bestLevel) {
      bestLevel = lvl;
      bestRoleId = roleId;
    }
  }
  if (!bestRoleId) return null;
  return guild.roles.cache.get(bestRoleId)?.name ?? null;
}

module.exports = { TIERS, getTier, titleForLevel };

// self-check: jalankan `node src/roles.js`
if (require.main === module) {
  const assert = require('assert');

  // getTier: owner via ownerId
  const mkMember = (id, ownerId, permList = []) => ({
    id,
    guild: { ownerId },
    permissions: { has: (f) => permList.includes(f) },
  });
  assert.strictEqual(getTier(mkMember('u1', 'u1')).key, 'owner', 'ownerId -> owner');
  assert.strictEqual(
    getTier(mkMember('u2', 'owner', [PermissionFlagsBits.Administrator])).key,
    'owner',
    'Administrator -> owner'
  );
  assert.strictEqual(
    getTier(mkMember('u3', 'owner', [PermissionFlagsBits.ManageGuild])).key,
    'admin',
    'ManageGuild -> admin'
  );
  assert.strictEqual(
    getTier(mkMember('u4', 'owner', [PermissionFlagsBits.ModerateMembers])).key,
    'mod',
    'ModerateMembers -> mod'
  );
  assert.strictEqual(
    getTier(mkMember('u5', 'owner', [PermissionFlagsBits.BanMembers])).key,
    'mod',
    'BanMembers -> mod'
  );
  assert.strictEqual(getTier(mkMember('u6', 'owner', [])).key, 'member', 'no perms -> member');
  assert.strictEqual(getTier(null).key, 'member', 'null -> member');

  // owner menang atas admin/mod kalau punya banyak izin
  assert.strictEqual(
    getTier(mkMember('u7', 'u7', [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.BanMembers])).key,
    'owner',
    'ownerId menang'
  );

  // titleForLevel: ambil role level tertinggi yang dicapai
  const guild = {
    roles: { cache: new Map([['r5', { name: 'PRINTIS' }], ['r15', { name: 'MAHASISWA' }]]) },
  };
  const cfg = { level_roles: { '5': 'r5', '15': 'r15' } };
  assert.strictEqual(titleForLevel(guild, cfg, 400), null, 'level 4 -> belum ada gelar');
  assert.strictEqual(titleForLevel(guild, cfg, 500), 'PRINTIS', 'level 5 -> PRINTIS');
  assert.strictEqual(titleForLevel(guild, cfg, 1400), 'PRINTIS', 'level 14 -> masih PRINTIS');
  assert.strictEqual(titleForLevel(guild, cfg, 1500), 'MAHASISWA', 'level 15 -> MAHASISWA');
  assert.strictEqual(titleForLevel(guild, { level_roles: {} }, 9999), null, 'no roles -> null');
  assert.strictEqual(titleForLevel(guild, cfg, 9999), 'MAHASISWA', 'level tinggi -> role tertinggi');
  // role id ga ada di cache -> null (bukan crash)
  assert.strictEqual(
    titleForLevel(guild, { level_roles: { '5': 'ghost' } }, 500),
    null,
    'role hilang -> null'
  );

  console.log('roles.js self-check passed');
}
