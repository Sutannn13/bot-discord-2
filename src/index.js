require('dotenv').config();
const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const cron = require('node-cron');
const { supabase, getConfig } = require('./db');
const { levelForXp } = require('./level');
const { handleInteraction } = require('./interactions');

// Jaring pengaman: bot jangan pernah mati gara-gara 1 error async (biar 24/7 beneran)
process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught exception:', err));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged
    GatewayIntentBits.GuildMembers,   // privileged
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Default; bisa dioverride per-server lewat /set-xp (guild_config.xp_settings)
const DEFAULTS = { messageXp: 3, voiceXpPerMin: 2, messageCooldown: 60 };
const cooldown = new Map();      // `${guildId}:${userId}` -> ms
const voiceSessions = new Map(); // `${guildId}:${userId}` -> { since: ms }

// ponytail: lock per-user in-process — bot single process. Serialize addXp user yang
// sama biar read-modify-write ga saling timpa. Kalau nanti di-shard, ganti pakai
// Postgres atomic increment RPC; Map ini cuma jaga satu node.
const xpLocks = new Map(); // `${guildId}:${userId}` -> Promise (ekor antrian)

function withUserLock(key, fn) {
  const prev = xpLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  xpLocks.set(key, next);
  next.finally(() => { if (xpLocks.get(key) === next) xpLocks.delete(key); }); // drain, ga leak
  return next;
}

// ---- Inti: nambah XP + cek naik level ----
async function addXp(guild, userId, amount, channel, extra = {}) {
  if (amount <= 0) return;
  const key = `${guild.id}:${userId}`;
  return withUserLock(key, () => _addXp(guild, userId, amount, channel, extra));
}

async function _addXp(guild, userId, amount, channel, extra) {
  const { data: u } = await supabase.from('users')
    .select('total_xp, weekly_xp')
    .eq('guild_id', guild.id).eq('user_id', userId).maybeSingle();

  const oldTotal = u?.total_xp || 0;
  const newTotal = oldTotal + amount;
  const oldLevel = levelForXp(oldTotal);   // "before" dari read yang SAMA, bukan kolom level
  const newLevel = levelForXp(newTotal);

  await supabase.from('users').upsert({
    guild_id: guild.id,
    user_id: userId,
    total_xp: newTotal,
    weekly_xp: (u?.weekly_xp || 0) + amount,
    level: newLevel,                        // cache doang; ga ada yang baca buat keputusan
    ...extra,
  }, { onConflict: 'guild_id,user_id' });

  if (newLevel > oldLevel) await handleLevelUp(guild, userId, oldLevel, newLevel, channel);
}

async function handleLevelUp(guild, userId, oldLevel, newLevel, channel) {
  const cfg = await getConfig(guild.id);
  // ponytail: grant voice gede bisa lompat beberapa level sekaligus — kasih semua role
  // di range, tapi announce cuma sekali (level tertinggi).
  if (cfg?.level_roles) {
    const member = await guild.members.fetch(userId).catch(() => null);
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      const roleId = cfg.level_roles[String(lvl)];
      if (roleId && member) await member.roles.add(roleId).catch(() => {}); // gagal diam kalau role bot di bawah target
    }
  }
  const ch = cfg?.announce_channel_id
    ? guild.channels.cache.get(cfg.announce_channel_id)
    : channel;
  ch?.send?.(`🎉 <@${userId}> naik ke **level ${newLevel}**!`).catch(() => {});
}

// Daftar kata kasar sederhana
const BAD_WORDS_REGEX = /\b(anjing|bangsat|babi|kontol|memek|ngentot|tolol|goblok|bajingan)\b/i;

// ---- XP dari chat ----
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;
    
    // --- Cek Kata Kasar ---
    const member = msg.member;
    const isStaff = msg.author.id === msg.guild.ownerId
      || member?.permissions.has(PermissionFlagsBits.ManageGuild)
      || member?.permissions.has(PermissionFlagsBits.ModerateMembers);

    if (BAD_WORDS_REGEX.test(msg.content) && !isStaff) {
      await msg.delete().catch(() => {});
      
      const { data: u } = await supabase.from('users')
        .select('sp_count, penalty_points')
        .eq('guild_id', msg.guild.id).eq('user_id', msg.author.id).maybeSingle();
      
      let spCount = u?.sp_count || 0;
      let penaltyPoints = (u?.penalty_points || 0) + 1;
      if (spCount < 3) spCount += 1;
      
      // Aman: hanya update kolom SP, tidak overwrite XP
      if (u) {
        await supabase.from('users')
          .update({ sp_count: spCount, penalty_points: penaltyPoints })
          .eq('guild_id', msg.guild.id).eq('user_id', msg.author.id);
      } else {
        await supabase.from('users').insert({
          guild_id: msg.guild.id,
          user_id: msg.author.id,
          sp_count: spCount,
          penalty_points: penaltyPoints
        });
      }
      
      await supabase.from('warnings').insert({
        guild_id: msg.guild.id,
        user_id: msg.author.id,
        moderator_id: client.user.id,
        reason: 'Auto SP: Terdeteksi menggunakan kata kasar'
      });
      
      // SP Escalation
      let escalationMsg = '';
      const guildMember = await msg.guild.members.fetch(msg.author.id).catch(() => null);
      if (spCount === 2 && guildMember) {
        // SP 2/3: Auto timeout 1 jam
        await guildMember.timeout(60 * 60 * 1000, 'Auto: SP 2/3 — kata kasar berulang').catch(() => {});
        escalationMsg = '\n🔇 **Kamu di-timeout 1 jam** karena pelanggaran berulang.';
      } else if (spCount >= 3 && guildMember) {
        // SP 3/3: Auto kick
        if (guildMember.kickable) {
          await guildMember.kick('Auto: SP 3/3 — kata kasar berulang').catch(() => {});
          escalationMsg = '\n👢 **Kamu di-kick** karena sudah 3x pelanggaran.';
        }
      }
      
      msg.channel.send(`<@${msg.author.id}>, pesan Anda dihapus karena mengandung kata kasar! Anda sekarang memiliki **SP ${spCount}/3** dan **${penaltyPoints} Poin Penalti**.${escalationMsg}`)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        
      return; // Stop disini
    }
    // --- Akhir Cek Kata Kasar ---

    const cfg = await getConfig(msg.guild.id);
    const xp = { ...DEFAULTS, ...(cfg?.xp_settings || {}) };
    if ((xp.noXpChannels || []).includes(msg.channelId)) return;

    const key = `${msg.guild.id}:${msg.author.id}`;
    const now = Date.now();
    if (cooldown.has(key) && now - cooldown.get(key) < xp.messageCooldown * 1000) return;
    cooldown.set(key, now);

    await addXp(msg.guild, msg.author.id, xp.messageXp, msg.channel, {
      last_message_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('messageCreate error:', err);
  }
});

// ---- XP dari voice ----
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
 try {
  const userId = newState.id;
  if (newState.member?.user?.bot) return;
  if (oldState.channelId === newState.channelId) return; // mute/deaf toggle, bukan pindah channel

  const key = `${newState.guild.id}:${userId}`;

  // keluar/pindah dari channel lama -> kasih XP buat waktu tadi
  if (oldState.channelId) {
    const session = voiceSessions.get(key);
    voiceSessions.delete(key);
    if (session) {
      const minutes = Math.floor((Date.now() - session.since) / 60000);
      const others = oldState.channel?.members.filter((m) => !m.user.bot && m.id !== userId).size ?? 0;
      // ponytail: anti-farm sederhana — min. 1 orang lain & ga self-deaf. Sesi hilang kalau bot restart.
      if (minutes >= 1 && others >= 1 && !oldState.selfDeaf) {
        const cfg = await getConfig(newState.guild.id);
        const rate = cfg?.xp_settings?.voiceXpPerMin ?? DEFAULTS.voiceXpPerMin;
        await addXp(newState.guild, userId, minutes * rate);
      }
    }
  }
  // masuk channel baru -> mulai sesi
  if (newState.channelId) voiceSessions.set(key, { since: Date.now() });
 } catch (err) {
  console.error('voiceStateUpdate error:', err);
 }
});

// ---- Slash commands ----
client.on(Events.InteractionCreate, handleInteraction);

// ---- Reset mingguan + umumkan Top Member (Senin 00:00 WIB) ----
cron.schedule('0 0 * * 1', async () => {
  const { data: cfgs } = await supabase.from('guild_config').select('guild_id, announce_channel_id');
  for (const cfg of cfgs || []) {
    if (!cfg.announce_channel_id) continue;
    const { data: rows } = await supabase.from('users')
      .select('user_id, weekly_xp').eq('guild_id', cfg.guild_id)
      .order('weekly_xp', { ascending: false }).limit(3);
    const top = (rows || []).filter((r) => r.weekly_xp > 0);
    if (!top.length) continue;
    const list = top.map((r, i) => `${['🥇', '🥈', '🥉'][i]} <@${r.user_id}> — ${r.weekly_xp} XP`).join('\n');
    client.channels.cache.get(cfg.announce_channel_id)?.send?.({
      content: `🏆 **Top Member Minggu Ini!**\n${list}`,
      allowedMentions: { users: top.map((r) => r.user_id) },
    }).catch(() => {});
  }
  await supabase.from('users').update({ weekly_xp: 0 }).gt('weekly_xp', 0);
  console.log('🔁 Weekly XP di-reset.');
}, { timezone: 'Asia/Jakarta' });

client.once(Events.ClientReady, async (c) => {
  // Recover voice sessions: scan semua voice channel dan inisialisasi session
  for (const [, guild] of c.guilds.cache) {
    for (const [, channel] of guild.channels.cache) {
      if (channel.isVoiceBased?.()) {
        for (const [memberId, member] of channel.members) {
          if (!member.user.bot) {
            voiceSessions.set(`${guild.id}:${memberId}`, { since: Date.now() });
          }
        }
      }
    }
  }
  console.log(`✅ Login sebagai ${c.user.tag} — ${voiceSessions.size} voice session recovered`);
});
client.login(process.env.DISCORD_TOKEN);
