# PPOB Digiflazz

## Jalankan di Linux Mint
```bash
sudo apt install -y nodejs npm     # kalau Node belum ada (disarankan Node 18+; atau pakai nvm)
cd ppob
npm install
cp .env.example .env && nano .env  # isi DIGI_USER, DIGI_KEY (Development Key), JWT_SECRET, ADMIN_EMAIL
npm start                          # buka http://localhost:3000
```
1. Daftar di web pakai email = `ADMIN_EMAIL` -> otomatis jadi admin.
2. Buka `/admin.html` -> "Sync Produk" (atau otomatis saat server start).
3. Deposit: user buat tagihan -> transfer -> admin konfirmasi di `/admin.html`.

## Webhook Digiflazz
URL: `https://domainmu/webhook/digiflazz`, secret sama dengan `DIGI_WEBHOOK_SECRET`.
Saat masih di PC, pakai tunnel (mis. `cloudflared tunnel --url http://localhost:3000`).

## Production
Butuh VPS ber-IP tetap -> whitelist IP itu di Digiflazz, ganti ke Production Key, `TESTING=false`,
jalankan dengan `NODE_ENV=production` di belakang HTTPS (Caddy/Nginx) dan pm2/systemd.
