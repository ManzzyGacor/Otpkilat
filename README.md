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
- `SESSION_SECRET` — kunci penandatangan token login
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

## Mode siang dan malam

Tema mengikuti pengaturan perangkat dan dapat diganti manual lewat tombol di
kanan atas setiap halaman, atau di Profil > Tampilan. Pilihan tersimpan di
peramban pengguna.
