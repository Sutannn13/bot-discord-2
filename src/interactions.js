const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { supabase, getConfig, invalidateConfig } = require('./db');
const { progress, levelForXp } = require('./level');
const { TIERS, getTier, titleForLevel } = require('./roles');

const ADMIN = PermissionFlagsBits.ManageGuild;

const COLOR = 0x5865f2;
const RED = 0xed4245;
const YELLOW = 0xfee75c;
const GREEN = 0x57f287;

// Balasan ephemeral (cuma keliatan yang manggil). Ganti `ephemeral: true` yang deprecated.
const EPH = MessageFlags.Ephemeral;

// Gerbang izin seragam — ganti ~11 blok "⚠️ Kamu ga punya izin" yang copy-paste.
// Balikin true kalau BOLEH lanjut; kalau ga, reply penolakan & balikin false.
async function requirePerm(i, flag, label = 'akses ini') {
  if (i.memberPermissions?.has(flag)) return true;
  await i.reply({ content: `⚠️ Kamu ga punya izin (butuh **${label}**).`, flags: EPH });
  return false;
}

// Router utama
async function handleInteraction(i) {
  if (!i.isChatInputCommand()) return;
  try {
    switch (i.commandName) {
      case 'ping': return await i.reply('Pong! 🏓 Bot hidup.');
      case 'rank': return await rank(i);
      case 'top': return await top(i);
      case 'help': return await help(i);
      case 'report': return await report(i);
      case 'set-xp': return await setXp(i);
      case 'set-levelrole': return await setLevelRole(i);
      case 'set-announce': return await setChannel(i, 'announce_channel_id', 'pengumuman naik level');
      case 'set-modlog': return await setChannel(i, 'mod_log_channel_id', 'log moderasi');
      case 'set-reportchannel': return await setChannel(i, 'report_channel_id', 'laporan member');
      case 'noxp': return await noxp(i);
      case 'set-badwords': return await setBadwords(i);
      case 'warn': return await warn(i);
      case 'warnings': return await listWarnings(i);
      case 'kick': return await kick(i);
      case 'ban': return await ban(i);
      case 'timeout': return await timeout(i);
      case 'unwarn': return await unwarn(i);
      case 'clearwarn': return await clearwarn(i);
    }
  } catch (err) {
    console.error(`Error di /${i.commandName}:`, err);
    const msg = { content: '⚠️ Ada error pas jalanin command ini.', flags: EPH };
    if (i.replied || i.deferred) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
}

// ---------- Member ----------
async function rank(i) {
  const user = i.options.getUser('user') || i.user;
  const { data: u } = await supabase.from('users')
    .select('total_xp, level, sp_count, penalty_points').eq('guild_id', i.guildId).eq('user_id', user.id).maybeSingle();
  if (!u) return i.reply({ content: `${user} belum punya XP. Chat dulu bang! 💬`, flags: EPH });

  const p = progress(u.total_xp);
  const { count } = await supabase.from('users')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', i.guildId).gt('total_xp', u.total_xp);
  const rankPos = (count || 0) + 1;

  let bar, desc;
  if (p.max) {
    bar = '🟩'.repeat(10);
    desc = `${bar}\n🏆 **MAX — Level 100**`;
  } else {
    const filled = Math.max(0, Math.min(10, Math.round((p.into / p.need) * 10)));
    bar = '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);
    desc = `${bar}\n**${p.into} / ${p.need} XP** menuju level ${p.level + 1}`;
  }

  // Badge tier + gelar level. Ambil member target (bukan pemanggil) buat tier yang benar.
  const targetMember = await i.guild.members.fetch(user.id).catch(() => null);
  const tier = getTier(targetMember);
  const cfg = await getConfig(i.guildId);
  const title = titleForLevel(i.guild, cfg, u.total_xp);
  const badge = `${tier.emoji} ${tier.label}${title ? ` • ${title}` : ''}`;

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`📊 Level ${p.level}`)
    .setDescription(`${badge}\n${desc}`)
    .addFields(
      { name: 'Total XP', value: `${u.total_xp}`, inline: true },
      { name: 'Ranking', value: `#${rankPos}`, inline: true },
      { name: 'SP', value: `${u.sp_count || 0}/3`, inline: true },
      { name: 'Penalty', value: `${u.penalty_points || 0} pts`, inline: true }
    );
  return i.reply({ embeds: [embed] });
}

async function top(i) {
  const { data: rows } = await supabase.from('users')
    .select('user_id, total_xp').eq('guild_id', i.guildId)
    .order('total_xp', { ascending: false }).limit(10);
  const cfg = await getConfig(i.guildId);
  const medal = ['🥇', '🥈', '🥉'];
  const list = (rows || []).map((r, idx) => {
    const title = titleForLevel(i.guild, cfg, r.total_xp);
    const tag = title ? ` — *${title}*` : '';
    return `${medal[idx] || `**${idx + 1}.**`} <@${r.user_id}> — Lv ${levelForXp(r.total_xp)} (${r.total_xp} XP)${tag}`;
  }).join('\n') || 'Belum ada data.';
  const embed = new EmbedBuilder().setColor(COLOR).setTitle('🏆 Top 10 Member').setDescription(list);
  return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

// Blok /help per tier. Tiap blok punya minRank: cuma muncul kalau tier user >= itu.
// Disusun bertingkat — moderator lihat blok moderasi walau bukan admin; owner lihat semua.
const HELP_BLOCKS = [
  {
    minRank: TIERS.member.rank,
    name: '👤 Command Member',
    value:
      '`/rank [user]` — level, XP, progress, badge tier & gelar.\n`/top` — 10 member paling aktif.\n`/report <user> <alasan>` — lapor member ke admin.\n`/help` — panduan ini.\n`/ping` — cek bot hidup.',
  },
  {
    minRank: TIERS.mod.rank,
    name: '⚔️ Command Moderasi',
    value:
      '`/warn <user> <alasan>` — beri peringatan (di-log & DM ke user).\n`/warnings <user>` — riwayat peringatan.\n`/unwarn <user>` — hapus warning terakhir.\n`/clearwarn <user>` — hapus semua warning + reset SP.\n`/timeout <user> <menit> [alasan]` — timeout member.\n`/kick <user> [alasan]` — keluarkan member.\n`/ban <user> [alasan]` — ban member.',
  },
  {
    minRank: TIERS.admin.rank,
    name: '🛠️ Command Admin',
    value:
      '`/set-xp <chat> [voice] [cooldown]` — atur rate XP.\n`/set-levelrole <level> <role>` — role otomatis di level tertentu.\n`/set-announce <channel>` — channel pengumuman naik level.\n`/set-modlog <channel>` — channel log moderasi.\n`/set-reportchannel <channel>` — channel laporan member.\n`/noxp <add|remove> <channel>` — channel tanpa XP.\n`/set-badwords <add|remove|list> [kata]` — atur filter kata kasar.',
  },
  {
    minRank: TIERS.owner.rank,
    name: '👑 Catatan Owner',
    value:
      'Kamu punya akses penuh (Administrator/Owner). Semua command config & moderasi kebuka.\n⚠️ Pastikan role **Bot EXP** ada di ATAS role level & punya izin Kick/Ban/Moderate biar semua fitur jalan.',
  },
];

async function help(i) {
  const tier = getTier(i.member);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('📖 Panduan Bot EXP')
    .setDescription(
      `Kamu login sebagai **${tier.emoji} ${tier.label}**.\n` +
        'Bot ini ngasih **XP** tiap kamu aktif. Makin aktif → makin tinggi level → bisa dapat role otomatis.'
    )
    .addFields({
      name: '⚡ Cara dapat XP',
      value:
        '• **Chat**: +XP tiap pesan (ada cooldown, jadi spam ga ngefek).\n• **Voice**: +XP tiap menit di voice (min. 2 orang & ga di-deafen).\n• Kumpul XP → naik level → dapat role (kalau di-set admin).',
    });

  for (const block of HELP_BLOCKS) {
    if (tier.rank >= block.minRank) embed.addFields({ name: block.name, value: block.value });
  }

  embed.setFooter({ text: `Kamu lihat versi ${tier.label}. • Bot EXP` });
  return i.reply({ embeds: [embed], flags: EPH });
}

async function report(i) {
  const target = i.options.getUser('user');
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa report diri sendiri.', flags: EPH });
  if (target.bot) return i.reply({ content: '⚠️ Ga bisa report bot.', flags: EPH });
  const reason = i.options.getString('reason');
  const cfg = await getConfig(i.guildId);
  const ch = cfg?.report_channel_id && i.guild.channels.cache.get(cfg.report_channel_id);
  if (!ch) return i.reply({ content: '⚠️ Channel laporan belum di-set admin (`/set-reportchannel`).', flags: EPH });

  const embed = new EmbedBuilder()
    .setColor(RED).setTitle('🚨 Laporan Baru')
    .addFields(
      { name: 'Dilaporkan', value: `${target} (\`${target.id}\`)` },
      { name: 'Pelapor', value: `${i.user}` },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await ch.send({ embeds: [embed] }).catch(() => {});
  return i.reply({ content: '✅ Laporan kamu udah dikirim ke admin. Makasih!', flags: EPH });
}

// ---------- Admin config ----------
async function setXp(i) {
  if (!(await requirePerm(i, ADMIN, 'Manage Server'))) return;
  const chat = i.options.getInteger('chat');
  const voice = i.options.getInteger('voice');
  const cd = i.options.getInteger('cooldown');
  const cfg = await getConfig(i.guildId);
  const xp_settings = { ...(cfg?.xp_settings || {}), messageXp: chat };
  if (voice !== null) xp_settings.voiceXpPerMin = voice;
  if (cd !== null) xp_settings.messageCooldown = cd;
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, xp_settings }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({
    content: `✅ XP di-set: **${chat}**/chat${voice !== null ? `, **${voice}**/menit voice` : ''}${cd !== null ? `, cooldown **${cd}s**` : ''}.`,
    flags: EPH,
  });
}

async function setLevelRole(i) {
  if (!(await requirePerm(i, ADMIN, 'Manage Server'))) return;
  const level = i.options.getInteger('level');
  const role = i.options.getRole('role');
  const cfg = await getConfig(i.guildId);
  const level_roles = { ...(cfg?.level_roles || {}), [String(level)]: role.id };
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, level_roles }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({ content: `✅ Level **${level}** sekarang dapat role ${role}.\n⚠️ Pastikan role **Bot EXP** ada di ATAS role itu (Server Settings → Roles).`, flags: EPH });
}

async function setChannel(i, column, label) {
  if (!(await requirePerm(i, ADMIN, 'Manage Server'))) return;
  const ch = i.options.getChannel('channel');
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, [column]: ch.id }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({ content: `✅ Channel ${label} di-set ke ${ch}.`, flags: EPH });
}

async function noxp(i) {
  if (!(await requirePerm(i, ADMIN, 'Manage Server'))) return;
  const action = i.options.getString('action');
  const ch = i.options.getChannel('channel');
  const cfg = await getConfig(i.guildId);
  const xp_settings = { ...(cfg?.xp_settings || {}) };
  const set = new Set(xp_settings.noXpChannels || []);
  if (action === 'add') set.add(ch.id); else set.delete(ch.id);
  xp_settings.noXpChannels = [...set];
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, xp_settings }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({
    content: action === 'add' ? `✅ ${ch} sekarang **ga ngasih XP**.` : `✅ ${ch} **ngasih XP lagi**.`,
    flags: EPH,
  });
}

// Filter kata kasar configurable per-guild. Disimpan di guild_config.bad_words (jsonb array).
async function setBadwords(i) {
  if (!(await requirePerm(i, ADMIN, 'Manage Server'))) return;
  const action = i.options.getString('action');
  const cfg = await getConfig(i.guildId);
  const words = Array.isArray(cfg?.bad_words) ? [...cfg.bad_words] : [];

  if (action === 'list') {
    return i.reply({
      content: words.length
        ? `📋 Kata kasar custom (**${words.length}**):\n${words.map((w) => `\`${w}\``).join(', ')}\n\n_Default bawaan bot tetap aktif._`
        : '📋 Belum ada kata custom. Filter pakai daftar default bawaan bot.',
      flags: EPH,
    });
  }

  const raw = i.options.getString('word');
  const word = (raw || '').trim().toLowerCase();
  if (!word) return i.reply({ content: '⚠️ Kasih kata yang mau di-`add`/`remove`.', flags: EPH });

  const set = new Set(words);
  if (action === 'add') set.add(word);
  else set.delete(word);
  const bad_words = [...set];

  await supabase.from('guild_config').upsert({ guild_id: i.guildId, bad_words }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({
    content: action === 'add'
      ? `✅ \`${word}\` ditambah ke filter. Total custom: **${bad_words.length}**.`
      : `✅ \`${word}\` dihapus dari filter. Total custom: **${bad_words.length}**.`,
    flags: EPH,
  });
}

// ---------- Moderation ----------
async function modLog(guild, embed) {
  const cfg = await getConfig(guild.id);
  if (!cfg?.mod_log_channel_id) return;
  guild.channels.cache.get(cfg.mod_log_channel_id)?.send({ embeds: [embed] }).catch(() => {});
}

async function warn(i) {
  if (!(await requirePerm(i, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const target = i.options.getUser('user');
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa warn diri sendiri.', flags: EPH });
  if (target.bot) return i.reply({ content: '⚠️ Ga bisa warn bot.', flags: EPH });
  const targetMember = await i.guild.members.fetch(target.id).catch(() => null);
  if (targetMember && targetMember.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa warn member dengan role yang sama atau lebih tinggi.', flags: EPH });

  const reason = i.options.getString('reason');
  await supabase.from('warnings').insert({
    guild_id: i.guildId, user_id: target.id, moderator_id: i.user.id, reason,
  });
  const { count } = await supabase.from('warnings')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  await target.send(`⚠️ Kamu dapat peringatan di **${i.guild.name}**.\nAlasan: ${reason}`).catch(() => {});
  const embed = new EmbedBuilder().setColor(YELLOW).setTitle('⚠️ Warn')
    .addFields(
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Total warning', value: `${count}`, inline: true },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ ${target} diperingatkan. Total warning: **${count}**.`, flags: EPH });
}

async function listWarnings(i) {
  const target = i.options.getUser('user');
  const { data: rows } = await supabase.from('warnings')
    .select('reason, moderator_id, created_at')
    .eq('guild_id', i.guildId).eq('user_id', target.id)
    .order('created_at', { ascending: false }).limit(10);
  if (!rows?.length) return i.reply({ content: `${target} bersih, ga ada warning. ✨`, flags: EPH });
  const list = rows.map((r, idx) =>
    `**${idx + 1}.** ${r.reason || '(tanpa alasan)'} — oleh <@${r.moderator_id}>`
  ).join('\n');
  const embed = new EmbedBuilder().setColor(YELLOW).setTitle(`⚠️ Warning: ${target.username}`).setDescription(list);
  return i.reply({ embeds: [embed], flags: EPH });
}

async function kick(i) {
  if (!(await requirePerm(i, PermissionFlagsBits.KickMembers, 'Kick Members'))) return;
  const target = i.options.getMember('user');
  const reason = i.options.getString('reason') || 'Tanpa alasan';
  if (!target) return i.reply({ content: '⚠️ Member ga ada di server.', flags: EPH });
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa kick diri sendiri.', flags: EPH });
  if (target.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa kick member dengan role yang sama atau lebih tinggi.', flags: EPH });
  if (!target.kickable) return i.reply({ content: '⚠️ Ga bisa kick member ini (role Bot EXP mungkin di bawah dia).', flags: EPH });

  await target.kick(reason);
  const embed = new EmbedBuilder().setColor(RED).setTitle('👢 Kick')
    .addFields(
      { name: 'Member', value: `${target.user.tag}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ **${target.user.tag}** di-kick.`, flags: EPH });
}

async function ban(i) {
  if (!(await requirePerm(i, PermissionFlagsBits.BanMembers, 'Ban Members'))) return;
  const user = i.options.getUser('user');
  if (user.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa ban diri sendiri.', flags: EPH });
  const target = i.options.getMember('user');
  const reason = i.options.getString('reason') || 'Tanpa alasan';
  if (target && target.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa ban member dengan role yang sama atau lebih tinggi.', flags: EPH });
  if (target && !target.bannable) return i.reply({ content: '⚠️ Ga bisa ban member ini (cek posisi role Bot EXP).', flags: EPH });

  await i.guild.members.ban(user.id, { reason });
  const embed = new EmbedBuilder().setColor(RED).setTitle('🔨 Ban')
    .addFields(
      { name: 'Member', value: `${user.tag}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ **${user.tag}** di-ban.`, flags: EPH });
}

// ---------- Timeout ----------
async function timeout(i) {
  if (!(await requirePerm(i, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const target = i.options.getMember('user');
  if (!target) return i.reply({ content: '⚠️ Member ga ada di server.', flags: EPH });
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa timeout diri sendiri.', flags: EPH });
  if (target.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa timeout member dengan role yang sama atau lebih tinggi.', flags: EPH });

  const duration = i.options.getInteger('duration'); // dalam menit
  const reason = i.options.getString('reason') || 'Tanpa alasan';
  const ms = duration * 60 * 1000;

  await target.timeout(ms, reason);
  const embed = new EmbedBuilder().setColor(YELLOW).setTitle('🔇 Timeout')
    .addFields(
      { name: 'Member', value: `${target.user}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Durasi', value: `${duration} menit`, inline: true },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await modLog(i.guild, embed);
  await target.user.send(`🔇 Kamu di-timeout **${duration} menit** di **${i.guild.name}**.\nAlasan: ${reason}`).catch(() => {});
  return i.reply({ content: `✅ **${target.user.tag}** di-timeout ${duration} menit.`, flags: EPH });
}

// ---------- Warning Management ----------
async function unwarn(i) {
  if (!(await requirePerm(i, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const target = i.options.getUser('user');

  // Ambil warning terakhir untuk user ini
  const { data: rows } = await supabase.from('warnings')
    .select('id, reason')
    .eq('guild_id', i.guildId).eq('user_id', target.id)
    .order('created_at', { ascending: false }).limit(1);
  if (!rows?.length) return i.reply({ content: `${target} ga punya warning. ✨`, flags: EPH });

  await supabase.from('warnings').delete().eq('id', rows[0].id);
  const { count } = await supabase.from('warnings')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  const embed = new EmbedBuilder().setColor(GREEN).setTitle('✅ Unwarn')
    .addFields(
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Sisa warning', value: `${count}`, inline: true },
      { name: 'Warning dihapus', value: rows[0].reason || '(tanpa alasan)' },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ Warning terakhir ${target} dihapus. Sisa: **${count}**.`, flags: EPH });
}

async function clearwarn(i) {
  if (!(await requirePerm(i, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const target = i.options.getUser('user');

  const { count: before } = await supabase.from('warnings')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', i.guildId).eq('user_id', target.id);
  if (!before) return i.reply({ content: `${target} ga punya warning. ✨`, flags: EPH });

  await supabase.from('warnings').delete()
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  // Reset SP juga
  await supabase.from('users')
    .update({ sp_count: 0, penalty_points: 0 })
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  const embed = new EmbedBuilder().setColor(GREEN).setTitle('🧹 Clear Warnings')
    .addFields(
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Warning dihapus', value: `${before}`, inline: true },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ Semua **${before}** warning + SP ${target} dihapus.`, flags: EPH });
}

// ---------- Filter kata kasar configurable ----------
// Normalisasi kata biar rapi & konsisten dengan yang dipakai index.js buat matching.
function normalizeWord(w) {
  return String(w).toLowerCase().trim().replace(/\s+/g, ' ');
}

async function setBadwords(i) {
  if (!(await requirePerm(i, ADMIN, 'Manage Server'))) return;
  const action = i.options.getString('action');
  const cfg = await getConfig(i.guildId);
  const current = Array.isArray(cfg?.bad_words) ? cfg.bad_words : [];

  if (action === 'list') {
    const list = current.length
      ? current.map((w) => `\`${w}\``).join(', ')
      : '_(kosong — pakai daftar default bawaan bot)_';
    const embed = new EmbedBuilder().setColor(COLOR).setTitle('🤬 Filter Kata Kasar').setDescription(list);
    return i.reply({ embeds: [embed], flags: EPH });
  }

  const raw = i.options.getString('word');
  if (!raw) return i.reply({ content: '⚠️ Isi dulu kata-nya buat `add`/`remove`.', flags: EPH });
  const word = normalizeWord(raw);
  if (!word) return i.reply({ content: '⚠️ Kata ga valid.', flags: EPH });

  const set = new Set(current);
  if (action === 'add') set.add(word); else set.delete(word);
  const bad_words = [...set];
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, bad_words }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({
    content: action === 'add'
      ? `✅ \`${word}\` ditambahkan ke filter. Total: **${bad_words.length}** kata.`
      : `✅ \`${word}\` dihapus dari filter. Total: **${bad_words.length}** kata.`,
    flags: EPH,
  });
}

module.exports = { handleInteraction };
