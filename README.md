# KilatOTP

Platform virtual number dan OTP: pemesanan nomor, penerimaan kode OTP,
top up saldo, dan dashboard admin.

## Menjalankan

```bash
npm install
cp .env.example .env     # isi MONGODB_URI dan SESSION_SECRET
npm start                # atau: npm run dev
```

Buka `http://localhost:3000`.

## Struktur halaman

| URL | Isi |
| --- | --- |
| `/` | Landing page publik |
| `/login`, `/register` | Autentikasi, termasuk login Google |
| `/dashboard` | Ringkasan saldo, pesanan aktif, pengumuman |
| `/order` | Pilih layanan dan negara, pesan nomor, terima OTP |
| `/deposit` | Top up saldo |
| `/riwayat` | Riwayat pesanan dan top up |
| `/profile` | Data akun, password, pilihan tema |
| `/admin` | Dashboard admin |

## Konfigurasi

Hanya tiga nilai yang dibaca dari `.env`:

- `MONGODB_URI` — alamat database
- `SESSION_SECRET` — kunci penandatangan token login, minimal 32 karakter acak.
  Buat dengan `openssl rand -base64 48`. Server menolak menyala bila kosong
  atau terlalu pendek, karena kunci lemah membuat token sesi bisa dipalsukan.
- `PORT` — port server (opsional, bawaan 3000)

Sisanya diatur lewat **Admin > Pengaturan** dan tersimpan di database:
API key provider, kredensial Google OAuth, token Telegram, margin harga,
batas top up, penyimpanan foto profil, dan mode perbaikan.

Bila variabel lama masih ada di `.env`, nilainya otomatis dipindahkan ke
database saat server pertama kali dijalankan, lalu dikelola dari dashboard.

## Akun admin

Pengguna pertama yang mendaftar otomatis mendapat role `admin`.
Role pengguna lain dapat diubah dari Admin > Pengguna.

## Metode pembayaran

Dikelola di **Admin > Pembayaran**, dengan dua mode:

- **Manual** — user transfer ke rekening yang ditampilkan, admin mengonfirmasi
  di Admin > Deposit, lalu saldo ditambahkan.
- **Gateway** — tagihan dibuat otomatis lewat API provider dan saldo masuk
  begitu pembayaran terdeteksi.

Kode unik opsional ditambahkan ke nominal transfer manual agar pembayaran
mudah dicocokkan.

## Deploy ke Vercel

Repositori ini sudah siap dijalankan di Vercel tanpa perubahan lain.

1. Import repositori di dashboard Vercel. Framework Preset biarkan **Other**,
   Build Command dan Output Directory dikosongkan.
2. Isi Environment Variables di Project Settings:

   | Nama | Nilai |
   | --- | --- |
   | `MONGODB_URI` | connection string MongoDB Atlas |
   | `SESSION_SECRET` | hasil `openssl rand -base64 48` |

3. Deploy. Setelah hidup, buka `/register` dan daftar. Pengguna pertama
   otomatis menjadi admin.
4. Masuk ke `/admin` > Pengaturan untuk mengisi API key provider, kredensial
   Google, token Telegram, dan metode pembayaran.

Bila memakai login Google, isi Callback URL di Admin > Pengaturan dengan
`https://domain-anda.vercel.app/api/auth/google/callback`, dan daftarkan
alamat yang sama persis di Google Cloud Console.

### Cara kerjanya

`vercel.json` mengarahkan `/css/*` dan `/js/*` ke CDN statis, sedangkan
halaman dan `/api/*` ditangani satu serverless function di `api/index.js`.

Aplikasi Express dibangun di `app.js` tanpa `listen()`, sehingga bisa dipakai
dua arah: `server.js` untuk server biasa, `api/index.js` untuk Vercel.
Koneksi MongoDB disimpan pada objek global dan dipakai ulang antar invocation,
supaya jatah koneksi Atlas tidak cepat habis. Bila database sedang tidak bisa
dihubungi, endpoint menjawab 503 yang rapi, bukan crash.

MongoDB Atlas perlu mengizinkan akses dari mana saja (`0.0.0.0/0`) karena
alamat IP serverless Vercel berubah-ubah.

## Catatan keamanan

- Login Google hanya aktif setelah Client ID dan Client Secret diisi di
  Admin > Pengaturan. Selama belum diisi, seluruh jalur login Google menolak
  permintaan, termasuk endpoint token.
- Token sesi hanya diterima lewat header `Authorization`, tidak lewat URL.
- Callback Google mewajibkan cookie `state` yang cocok, sehingga tautan callback
  milik orang lain tidak bisa dipakai memaksa korban masuk ke akun penyerang.

## Mode siang dan malam

Tema mengikuti pengaturan perangkat dan dapat diganti manual lewat tombol di
kanan atas setiap halaman, atau di Profil > Tampilan. Pilihan tersimpan di
peramban pengguna.

## Gerak dan animasi

Seluruh situs memakai satu bahasa gerak yang didefinisikan di `public/css/style.css`:
kartu muncul saat tergulir mendekat, isi halaman masuk perlahan, angka saldo
dihitung naik, tombol punya riak sentuh, dan perpindahan halaman memudar singkat
dengan bilah kemajuan tipis di atas layar.

Semua gerakan otomatis dimatikan bagi pengguna yang mengaktifkan "kurangi
animasi" di perangkatnya.
