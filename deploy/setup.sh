#!/usr/bin/env bash
# Jalankan di VPS sebagai root/sudo, dari folder yang berisi folder "ppob" (hasil unzip).
# Pakai: sudo bash setup.sh
set -euo pipefail
APP_DIR=/opt/ppob
APP_USER=ppob

[ -f ./ppob/.env ] || { cp ./ppob/.env.example ./ppob/.env; echo "!! .env dibuat dari contoh. Isi dulu: nano ppob/.env (DIGI_USER, DIGI_KEY, JWT_SECRET acak panjang, DIGI_WEBHOOK_SECRET, ADMIN_EMAIL, BANK_INFO), lalu jalankan ulang."; exit 1; }
echo "== 1. Paket dasar & Node 20 =="
apt-get update -y
apt-get install -y curl ca-certificates build-essential python3 ufw
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 2. User & folder aplikasi =="
id -u $APP_USER >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin $APP_USER
mkdir -p $APP_DIR
rsync -a --exclude node_modules --exclude ppob.db ./ppob/ $APP_DIR/ 2>/dev/null || cp -r ./ppob/. $APP_DIR/
chown -R $APP_USER:$APP_USER $APP_DIR
chmod 600 $APP_DIR/.env

echo "== 3. npm install =="
sudo -u $APP_USER bash -c "cd $APP_DIR && npm install --omit=dev"

echo "== 4. systemd =="
cat > /etc/systemd/system/ppob.service <<UNIT
[Unit]
Description=PPOB Digiflazz
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ppob
sleep 2
systemctl --no-pager status ppob | head -n 12

echo "== 5. Backup harian database =="
cat > /etc/cron.daily/ppob-backup <<CRON
#!/bin/sh
mkdir -p /var/backups/ppob
sqlite3 $APP_DIR/ppob.db ".backup '/var/backups/ppob/ppob-\$(date +%F).db'" 2>/dev/null || cp $APP_DIR/ppob.db /var/backups/ppob/ppob-\$(date +%F).db
find /var/backups/ppob -type f -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/ppob-backup
apt-get install -y sqlite3 >/dev/null

echo
echo "Selesai. App jalan di 127.0.0.1:3000 (cek: curl -I http://127.0.0.1:3000)."
echo "Berikutnya: pasang HTTPS (Caddy atau Cloudflare Tunnel) -> lihat DEPLOY.md"
