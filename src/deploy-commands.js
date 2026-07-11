require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const ADMIN = PermissionFlagsBits.ManageGuild;
const textChannel = (o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText);

const commands = [
  // ----- Member -----
  new SlashCommandBuilder().setName('ping').setDescription('Cek bot hidup atau enggak'),
  new SlashCommandBuilder().setName('help').setDescription('Panduan & cara kerja bot'),
  new SlashCommandBuilder().setName('rank').setDescription('Lihat level & XP kamu')
    .addUserOption((o) => o.setName('user').setDescription('Cek member lain (opsional)').setRequired(false)),
  new SlashCommandBuilder().setName('top').setDescription('Leaderboard top 10'),
  new SlashCommandBuilder().setName('report').setDescription('Lapor member ke admin')
    .addUserOption((o) => o.setName('user').setDescription('Member yang dilaporkan').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan laporan').setRequired(true)),

  // ----- Admin config -----
  new SlashCommandBuilder().setName('set-xp').setDescription('Atur rate XP').setDefaultMemberPermissions(ADMIN)
    .addIntegerOption((o) => o.setName('chat').setDescription('XP per pesan').setRequired(true).setMinValue(0))
    .addIntegerOption((o) => o.setName('voice').setDescription('XP per menit di voice').setRequired(false).setMinValue(0))
    .addIntegerOption((o) => o.setName('cooldown').setDescription('Jeda XP chat (detik)').setRequired(false).setMinValue(0)),
  new SlashCommandBuilder().setName('set-levelrole').setDescription('Role otomatis di level tertentu').setDefaultMemberPermissions(ADMIN)
    .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(100))
    .addRoleOption((o) => o.setName('role').setDescription('Role yang dikasih').setRequired(true)),
  new SlashCommandBuilder().setName('set-announce').setDescription('Channel pengumuman naik level').setDefaultMemberPermissions(ADMIN)
    .addChannelOption(textChannel),
  new SlashCommandBuilder().setName('set-modlog').setDescription('Channel log moderasi').setDefaultMemberPermissions(ADMIN)
    .addChannelOption(textChannel),
  new SlashCommandBuilder().setName('set-reportchannel').setDescription('Channel laporan member').setDefaultMemberPermissions(ADMIN)
    .addChannelOption(textChannel),
  new SlashCommandBuilder().setName('noxp').setDescription('Channel yang ga ngasih XP').setDefaultMemberPermissions(ADMIN)
    .addStringOption((o) => o.setName('action').setDescription('add / remove').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
    .addChannelOption(textChannel),

  // ----- Moderation -----
  new SlashCommandBuilder().setName('warn').setDescription('Beri peringatan ke member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan').setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('Lihat riwayat peringatan member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Keluarkan member').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban member').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan').setRequired(false)),
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout member (ga bisa chat/react)').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption((o) => o.setName('duration').setDescription('Durasi (menit)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan').setRequired(false)),
  new SlashCommandBuilder().setName('unwarn').setDescription('Hapus warning terakhir member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarn').setDescription('Hapus semua warning + reset SP member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID) // instan (dev)
    : Routes.applicationCommands(process.env.CLIENT_ID);                            // global (~1 jam)
  await rest.put(route, { body: commands });
  console.log(`✅ ${commands.length} slash command ter-deploy${process.env.GUILD_ID ? ' (guild)' : ' (global)'}.`);
})();
