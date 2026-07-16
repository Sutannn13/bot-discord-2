-- ============================================================
--  discord-activity-bot — Skema Database (Supabase / PostgreSQL)
--  Jalankan seluruh isi file ini di Supabase SQL Editor.
--  Aman dijalankan berulang (semua "if not exists").
-- ============================================================

-- Tabel data user per guild (server)
create table if not exists users (
  guild_id         text not null,
  user_id          text not null,
  total_xp         bigint not null default 0,
  weekly_xp        bigint not null default 0,
  level            int not null default 0,
  sp_count         int not null default 0,
  penalty_points   int not null default 0,
  last_message_at  timestamptz,
  last_reaction_at timestamptz,
  primary key (guild_id, user_id)
);

-- Tabel konfigurasi per guild
create table if not exists guild_config (
  guild_id            text primary key,
  level_roles         jsonb not null default '{}'::jsonb,   -- { "5": "roleId", "15": "roleId", ... }
  top_role_id         text,
  announce_channel_id text,
  xp_settings         jsonb not null default '{}'::jsonb,    -- { messageXp, voiceXpPerMin, messageCooldown, noXpChannels: [] }
  timezone            text default 'Asia/Jakarta'
);

-- Kolom channel moderasi (ditambah belakangan)
alter table guild_config add column if not exists mod_log_channel_id text;   -- #guardian-log
alter table guild_config add column if not exists report_channel_id  text;   -- #report-user

-- Filter kata kasar per-guild (diatur lewat /set-badwords). Kosong = pakai default bawaan bot.
alter table guild_config add column if not exists bad_words jsonb not null default '[]'::jsonb;

-- Tabel riwayat peringatan (/warn)
create table if not exists warnings (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  user_id      text not null,
  moderator_id text not null,
  reason       text,
  created_at   timestamptz not null default now()
);

-- Index
create index if not exists idx_users_guild_total   on users (guild_id, total_xp desc);
create index if not exists idx_users_guild_weekly  on users (guild_id, weekly_xp desc);
create index if not exists idx_warnings_guild_user on warnings (guild_id, user_id);

-- Migrasi (Jalankan ini jika tabel users sudah ada)
alter table users add column if not exists sp_count int not null default 0;
alter table users add column if not exists penalty_points int not null default 0;
