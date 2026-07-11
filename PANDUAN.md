# 📖 Panduan Bot EXP — Hidup Jokowie

Bot leveling + moderation buat server Discord. Member dapat **XP** dari chat & voice, naik level, dan bisa dapat role otomatis. Admin bisa atur semuanya lewat slash command (ga perlu ngoding/SQL lagi).

---

## 1. Fitur

- **XP otomatis** dari chat & voice channel.
- **Level & role bertingkat** — naik level bisa dapat role otomatis (mis. PRINTIS, MAHASISWA).
- **Leaderboard** harian & **Top Member mingguan** (auto-reset tiap Senin).
- **Moderation**: `/warn`, `/kick`, `/ban`, `/report` + log otomatis.
- **Config lewat command** — semua diatur dari dalam Discord.

---

## 2. Cara Kerja XP & Level

| Sumber | XP | Catatan |
|---|---|---|
| Chat | **3 XP** / pesan | Ada cooldown **60 detik** (spam ga ngefek) |
| Voice | **2 XP** / menit | Cuma dihitung kalau min. **2 orang** di voice & ga di-deafen |

**Kurva level:** tiap level butuh **100 XP** (rata). Level maksimum **100**.

| Level | Total XP dibutuhkan |
|---|---|
| 1 | 100 |
| 2 | 200 |
| 3 | 300 |
| 5 | 500 |
| 10 | 1.000 |
| 100 (MAX) | 10.000 |

Rumus: total XP buat level `n` = `100 × n`. Di level **100** progress bar tampil **MAX**.

> Rate XP (per chat/voice) masih bisa diubah admin pakai `/set-xp`.

### ⚠️ Sistem SP (Surat Peringatan)

Kalau member pakai **kata kasar**, bot otomatis:
1. Hapus pesan + kasih SP.
2. **SP 1/3**: Warning.
3. **SP 2/3**: Auto **timeout 1 jam**.
4. **SP 3/3**: Auto **kick** dari server.

> Owner, admin (Manage Server), dan moderator (Moderate Members) **kebal** dari filter kata kasar.

---

## 3. Daftar Slash Command

### 👤 Member (semua orang)
| Command | Cara kerja |
|---|---|
| `/ping` | Cek bot hidup |
| `/rank [user]` | Lihat level, total XP, progress bar ke level berikut, & ranking. Tanpa `user` = diri sendiri |
| `/top` | 10 member dengan XP tertinggi |
| `/report <user> <alasan>` | Kirim laporan diam-diam ke channel admin (`#report-user`) |
| `/help` | Panduan singkat di dalam bot (member lihat versi member, admin lihat versi lengkap) |

### 🛠️ Admin (butuh izin *Manage Server*)
| Command | Cara kerja |
|---|---|
| `/set-xp <chat> [voice] [cooldown]` | Atur XP per chat, per menit voice, & cooldown |
| `/set-levelrole <level> <role>` | Kasih role otomatis pas member nyampe level itu |
| `/set-announce <channel>` | Channel buat pengumuman naik level & Top Member mingguan |
| `/set-modlog <channel>` | Channel log moderasi → arahin ke `#guardian-log` |
| `/set-reportchannel <channel>` | Channel laporan member → arahin ke `#report-user` |
| `/noxp <add\|remove> <channel>` | Channel yang ga ngasih XP (mis. `#meme`) |

### 🛡️ Moderation
| Command | Izin dibutuhkan | Cara kerja |
|---|---|---|
| `/warn <user> <alasan>` | Moderate Members | Catat peringatan, DM ke user, log ke `#guardian-log` |
| `/warnings <user>` | Moderate Members | Lihat riwayat peringatan |
| `/unwarn <user>` | Moderate Members | Hapus warning terakhir + log |
| `/clearwarn <user>` | Moderate Members | Hapus **semua** warning + reset SP |
| `/timeout <user> <menit> [alasan]` | Moderate Members | Timeout member (1 – 40320 menit) + log |
| `/kick <user> [alasan]` | Kick Members | Keluarkan member + log |
| `/ban <user> [alasan]` | Ban Members | Ban member + log |

> **Catatan keamanan:** Moderator tidak bisa warn/kick/ban member dengan role yang sama atau lebih tinggi.

---

## 4. Setup Awal (buat Admin) — sekali aja

Jalankan di server, urut:

```
/set-announce channel:#welcome
/set-modlog channel:#guardian-log
/set-reportchannel channel:#report-user
/set-levelrole level:5 role:@PRINTIS
/set-levelrole level:15 role:@MAHASISWA
/noxp add channel:#meme        (opsional)
```

⚠️ **PENTING soal role otomatis & moderasi:**
1. Role **Bot EXP** harus ada di **ATAS** role yang mau dikasih (mis. di atas PRINTIS/MAHASISWA). Kalau di bawah, bot ga bisa ngasih role. → Server Settings → Roles → geser role Bot EXP ke atas.
2. Biar `/kick` & `/ban` jalan, role **Bot EXP** harus punya permission **Kick Members**, **Ban Members**, & **Moderate Members**. → Server Settings → Roles → Bot EXP → nyalain permission itu.

---

## 5. Hosting 24/7 di Railway

Biar bot tetap hidup walau PC/laptop mati.

**Prasyarat:** kode udah masuk **GitHub repo**. File `.env` JANGAN ikut ke-commit (udah di-`.gitignore`).

1. **Push ke GitHub** (dari folder `discord-activity-bot`):
   ```bash
   git init
   git add .
   git commit -m "bot exp"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
   Bikin repo baru (disaranin **private**) di https://github.com/new dulu.

2. **Railway** → https://railway.app → **New Project** → **Deploy from GitHub repo** → pilih repo tadi.
   - Kalau repo isinya folder `bot discord`, buka **Settings → Root Directory** → isi `discord-activity-bot`.

3. **Set Environment Variables** di Railway → tab **Variables**, copy dari `.env` lokal:
   ```
   DISCORD_TOKEN
   CLIENT_ID
   GUILD_ID
   SUPABASE_URL
   SUPABASE_SERVICE_KEY
   ```

4. Railway otomatis jalanin `npm start`. Buka tab **Deployments → Logs**, tunggu muncul:
   ```
   ✅ Login sebagai Bot EXP#3552
   ```
   Bot udah online 24/7. 🎉

5. **Set spending cap** ($5) di **Project Settings → Usage** biar ga kebobolan tagihan.

> Slash command cukup di-deploy **sekali dari lokal** (`npm run deploy`) — pendaftaran ke Discord, ga tergantung lokasi hosting.

---

## 6. Update / Restart Bot

- **Di Railway:** cukup `git push` — Railway auto re-deploy tiap ada commit baru.
- **Nambah/ubah slash command:** edit `src/deploy-commands.js`, lalu `npm run deploy` dari lokal.
- **Di lokal (testing):** `npm start` (Ctrl+C buat stop).

---

## 7. Troubleshooting

| Masalah | Solusi |
|---|---|
| Bot offline / lampu abu-abu | Cek Logs Railway. Biasanya token salah atau env var kurang |
| Slash command ga muncul | `npm run deploy`. Kalau `GUILD_ID` kosong, command global butuh ±1 jam |
| Role otomatis ga kekasih | Role Bot EXP harus di ATAS role target (Server Settings → Roles) |
| `/kick` `/ban` gagal | Kasih role Bot EXP permission Kick/Ban Members, & role bot di atas target |
| XP ga nambah | Cek **MESSAGE CONTENT INTENT** nyala di Developer Portal. Cek channel ga masuk `/noxp` |
| Voice XP ga masuk | Harus ada min. 2 orang di voice & ga di-deafen; XP masuk pas keluar voice |
| DM warning ga kekirim | Normal kalau user tutup DM — moderasi tetap ke-log |

---

## 8. Struktur Kode (buat yang mau ngoprek)

```
src/
  index.js          # inti: connect, XP chat/voice, cron mingguan
  db.js             # koneksi Supabase + cache config
  level.js          # rumus XP & level (ada self-check: `node src/level.js`)
  interactions.js   # semua handler slash command
  deploy-commands.js# daftar & registrasi slash command
schema.sql          # skema database (jalankan di Supabase SQL Editor)
.env                # rahasia (JANGAN di-share / commit)
```
