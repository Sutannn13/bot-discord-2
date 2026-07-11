const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase, getConfig, invalidateConfig } = require('./db');
const { progress, levelForXp } = require('./level');

const ADMIN = PermissionFlagsBits.ManageGuild;

const COLOR = 0x5865f2;
const RED = 0xed4245;
const YELLOW = 0xfee75c;

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
    const msg = { content: '⚠️ Ada error pas jalanin command ini.', ephemeral: true };
    if (i.replied || i.deferred) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
}

// ---------- Member ----------
async function rank(i) {
  const user = i.options.getUser('user') || i.user;
  const { data: u } = await supabase.from('users')
    .select('total_xp, level, sp_count, penalty_points').eq('guild_id', i.guildId).eq('user_id', user.id).maybeSingle();
  if (!u) return i.reply({ content: `${user} belum punya XP. Chat dulu bang! 💬`, ephemeral: true });

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

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`📊 Level ${p.level}`)
    .setDescription(desc)
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
  const medal = ['🥇', '🥈', '🥉'];
  const list = (rows || []).map((r, idx) =>
    `${medal[idx] || `**${idx + 1}.**`} <@${r.user_id}> — Lv ${levelForXp(r.total_xp)} (${r.total_xp} XP)`
  ).join('\n') || 'Belum ada data.';
  const embed = new EmbedBuilder().setColor(COLOR).setTitle('🏆 Top 10 Member').setDescription(list);
  return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function help(i) {
  const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('📖 Panduan Bot EXP')
    .setDescription('Bot ini ngasih **XP** tiap kamu aktif. Makin aktif → makin tinggi level → bisa dapat role otomatis.')
    .addFields(
      {
        name: '⚡ Cara dapat XP',
        value: '• **Chat**: +XP tiap pesan (ada cooldown, jadi spam ga ngefek).\n• **Voice**: +XP tiap menit di voice (min. 2 orang & ga di-deafen).\n• Kumpul XP → naik level → dapat role (kalau di-set admin).',
      },
      {
        name: '👤 Command Member',
        value: '`/rank [user]` — level, XP, & progress kamu (atau orang lain).\n`/top` — 10 member paling aktif.\n`/report <user> <alasan>` — lapor member ke admin.\n`/help` — panduan ini.\n`/ping` — cek bot hidup.',
      },
    );
  if (isAdmin) {
    embed.addFields(
      {
        name: '🛠️ Command Admin',
        value: '`/set-xp <chat> [voice] [cooldown]` — atur rate XP.\n`/set-levelrole <level> <role>` — role otomatis di level tertentu.\n`/set-announce <channel>` — channel pengumuman naik level.\n`/set-modlog <channel>` — channel log moderasi.\n`/set-reportchannel <channel>` — channel laporan member.\n`/noxp <add|remove> <channel>` — channel tanpa XP.',
      },
      {
        name: '🛡️ Command Moderasi',
        value: '`/warn <user> <alasan>` — beri peringatan (di-log & DM ke user).\n`/warnings <user>` — riwayat peringatan.\n`/unwarn <user>` — hapus warning terakhir.\n`/clearwarn <user>` — hapus semua warning + reset SP.\n`/timeout <user> <menit> [alasan]` — timeout member.\n`/kick <user> [alasan]` — keluarkan member.\n`/ban <user> [alasan]` — ban member.',
      },
    );
  }
  embed.setFooter({ text: isAdmin ? 'Kamu lihat versi admin.' : 'Hidup Jokowie • Bot EXP' });
  return i.reply({ embeds: [embed], ephemeral: true });
}

async function report(i) {
  const target = i.options.getUser('user');
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa report diri sendiri.', ephemeral: true });
  if (target.bot) return i.reply({ content: '⚠️ Ga bisa report bot.', ephemeral: true });
  const reason = i.options.getString('reason');
  const cfg = await getConfig(i.guildId);
  const ch = cfg?.report_channel_id && i.guild.channels.cache.get(cfg.report_channel_id);
  if (!ch) return i.reply({ content: '⚠️ Channel laporan belum di-set admin (`/set-reportchannel`).', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(RED).setTitle('🚨 Laporan Baru')
    .addFields(
      { name: 'Dilaporkan', value: `${target} (\`${target.id}\`)` },
      { name: 'Pelapor', value: `${i.user}` },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await ch.send({ embeds: [embed] }).catch(() => {});
  return i.reply({ content: '✅ Laporan kamu udah dikirim ke admin. Makasih!', ephemeral: true });
}

// ---------- Admin config ----------
async function setXp(i) {
  if (!i.memberPermissions.has(ADMIN))
    return i.reply({ content: '⚠️ Kamu ga punya izin (butuh Manage Server).', ephemeral: true });
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
    ephemeral: true,
  });
}

async function setLevelRole(i) {
  if (!i.memberPermissions.has(ADMIN))
    return i.reply({ content: '⚠️ Kamu ga punya izin (butuh Manage Server).', ephemeral: true });
  const level = i.options.getInteger('level');
  const role = i.options.getRole('role');
  const cfg = await getConfig(i.guildId);
  const level_roles = { ...(cfg?.level_roles || {}), [String(level)]: role.id };
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, level_roles }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({ content: `✅ Level **${level}** sekarang dapat role ${role}.\n⚠️ Pastikan role **Bot EXP** ada di ATAS role itu (Server Settings → Roles).`, ephemeral: true });
}

async function setChannel(i, column, label) {
  if (!i.memberPermissions.has(ADMIN))
    return i.reply({ content: '⚠️ Kamu ga punya izin (butuh Manage Server).', ephemeral: true });
  const ch = i.options.getChannel('channel');
  await supabase.from('guild_config').upsert({ guild_id: i.guildId, [column]: ch.id }, { onConflict: 'guild_id' });
  invalidateConfig(i.guildId);
  return i.reply({ content: `✅ Channel ${label} di-set ke ${ch}.`, ephemeral: true });
}

async function noxp(i) {
  if (!i.memberPermissions.has(ADMIN))
    return i.reply({ content: '⚠️ Kamu ga punya izin (butuh Manage Server).', ephemeral: true });
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
    ephemeral: true,
  });
}

// ---------- Moderation ----------
async function modLog(guild, embed) {
  const cfg = await getConfig(guild.id);
  if (!cfg?.mod_log_channel_id) return;
  guild.channels.cache.get(cfg.mod_log_channel_id)?.send({ embeds: [embed] }).catch(() => {});
}

async function warn(i) {
  if (!i.memberPermissions.has(PermissionFlagsBits.ModerateMembers))
    return i.reply({ content: '⚠️ Kamu ga punya izin.', ephemeral: true });
  const target = i.options.getUser('user');
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa warn diri sendiri.', ephemeral: true });
  if (target.bot) return i.reply({ content: '⚠️ Ga bisa warn bot.', ephemeral: true });
  const targetMember = await i.guild.members.fetch(target.id).catch(() => null);
  if (targetMember && targetMember.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa warn member dengan role yang sama atau lebih tinggi.', ephemeral: true });

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
  return i.reply({ content: `✅ ${target} diperingatkan. Total warning: **${count}**.`, ephemeral: true });
}

async function listWarnings(i) {
  const target = i.options.getUser('user');
  const { data: rows } = await supabase.from('warnings')
    .select('reason, moderator_id, created_at')
    .eq('guild_id', i.guildId).eq('user_id', target.id)
    .order('created_at', { ascending: false }).limit(10);
  if (!rows?.length) return i.reply({ content: `${target} bersih, ga ada warning. ✨`, ephemeral: true });
  const list = rows.map((r, idx) =>
    `**${idx + 1}.** ${r.reason || '(tanpa alasan)'} — oleh <@${r.moderator_id}>`
  ).join('\n');
  const embed = new EmbedBuilder().setColor(YELLOW).setTitle(`⚠️ Warning: ${target.username}`).setDescription(list);
  return i.reply({ embeds: [embed], ephemeral: true });
}

async function kick(i) {
  if (!i.memberPermissions.has(PermissionFlagsBits.KickMembers))
    return i.reply({ content: '⚠️ Kamu ga punya izin.', ephemeral: true });
  const target = i.options.getMember('user');
  const reason = i.options.getString('reason') || 'Tanpa alasan';
  if (!target) return i.reply({ content: '⚠️ Member ga ada di server.', ephemeral: true });
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa kick diri sendiri.', ephemeral: true });
  if (target.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa kick member dengan role yang sama atau lebih tinggi.', ephemeral: true });
  if (!target.kickable) return i.reply({ content: '⚠️ Ga bisa kick member ini (role Bot EXP mungkin di bawah dia).', ephemeral: true });

  await target.kick(reason);
  const embed = new EmbedBuilder().setColor(RED).setTitle('👢 Kick')
    .addFields(
      { name: 'Member', value: `${target.user.tag}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ **${target.user.tag}** di-kick.`, ephemeral: true });
}

async function ban(i) {
  if (!i.memberPermissions.has(PermissionFlagsBits.BanMembers))
    return i.reply({ content: '⚠️ Kamu ga punya izin.', ephemeral: true });
  const user = i.options.getUser('user');
  if (user.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa ban diri sendiri.', ephemeral: true });
  const target = i.options.getMember('user');
  const reason = i.options.getString('reason') || 'Tanpa alasan';
  if (target && target.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa ban member dengan role yang sama atau lebih tinggi.', ephemeral: true });
  if (target && !target.bannable) return i.reply({ content: '⚠️ Ga bisa ban member ini (cek posisi role Bot EXP).', ephemeral: true });

  await i.guild.members.ban(user.id, { reason });
  const embed = new EmbedBuilder().setColor(RED).setTitle('🔨 Ban')
    .addFields(
      { name: 'Member', value: `${user.tag}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Alasan', value: reason },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ **${user.tag}** di-ban.`, ephemeral: true });
}

// ---------- Timeout ----------
async function timeout(i) {
  if (!i.memberPermissions.has(PermissionFlagsBits.ModerateMembers))
    return i.reply({ content: '⚠️ Kamu ga punya izin.', ephemeral: true });
  const target = i.options.getMember('user');
  if (!target) return i.reply({ content: '⚠️ Member ga ada di server.', ephemeral: true });
  if (target.id === i.user.id) return i.reply({ content: '⚠️ Ga bisa timeout diri sendiri.', ephemeral: true });
  if (target.roles.highest.position >= i.member.roles.highest.position)
    return i.reply({ content: '⚠️ Ga bisa timeout member dengan role yang sama atau lebih tinggi.', ephemeral: true });

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
  return i.reply({ content: `✅ **${target.user.tag}** di-timeout ${duration} menit.`, ephemeral: true });
}

// ---------- Warning Management ----------
async function unwarn(i) {
  if (!i.memberPermissions.has(PermissionFlagsBits.ModerateMembers))
    return i.reply({ content: '⚠️ Kamu ga punya izin.', ephemeral: true });
  const target = i.options.getUser('user');

  // Ambil warning terakhir untuk user ini
  const { data: rows } = await supabase.from('warnings')
    .select('id, reason')
    .eq('guild_id', i.guildId).eq('user_id', target.id)
    .order('created_at', { ascending: false }).limit(1);
  if (!rows?.length) return i.reply({ content: `${target} ga punya warning. ✨`, ephemeral: true });

  await supabase.from('warnings').delete().eq('id', rows[0].id);
  const { count } = await supabase.from('warnings')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  const embed = new EmbedBuilder().setColor(0x57f287).setTitle('✅ Unwarn')
    .addFields(
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Sisa warning', value: `${count}`, inline: true },
      { name: 'Warning dihapus', value: rows[0].reason || '(tanpa alasan)' },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ Warning terakhir ${target} dihapus. Sisa: **${count}**.`, ephemeral: true });
}

async function clearwarn(i) {
  if (!i.memberPermissions.has(PermissionFlagsBits.ModerateMembers))
    return i.reply({ content: '⚠️ Kamu ga punya izin.', ephemeral: true });
  const target = i.options.getUser('user');

  const { count: before } = await supabase.from('warnings')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', i.guildId).eq('user_id', target.id);
  if (!before) return i.reply({ content: `${target} ga punya warning. ✨`, ephemeral: true });

  await supabase.from('warnings').delete()
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  // Reset SP juga
  await supabase.from('users')
    .update({ sp_count: 0, penalty_points: 0 })
    .eq('guild_id', i.guildId).eq('user_id', target.id);

  const embed = new EmbedBuilder().setColor(0x57f287).setTitle('🧹 Clear Warnings')
    .addFields(
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${i.user}`, inline: true },
      { name: 'Warning dihapus', value: `${before}`, inline: true },
    ).setTimestamp();
  await modLog(i.guild, embed);
  return i.reply({ content: `✅ Semua **${before}** warning + SP ${target} dihapus.`, ephemeral: true });
}

module.exports = { handleInteraction };
