# Deploy PPOB ke VPS

## 0. Cek SSH & firewall SEBELUM mengaktifkan ufw (supaya tidak terkunci)
```bash
sudo ss -tlnp | grep sshd           # port yang didengar sshd di dalam server
sudo sshd -T | grep -i '^port'
```
VPS ini di belakang NAT (10.10.0.234). Port yang kamu pakai dari luar bisa BERBEDA
dengan port di dalam server -> lihat "port forwarding / NAT" di panel provider.

## 1. Upload & install
```bash
# dari komputer lokal (ganti PORT_SSH, USER, IP):
scp -P PORT_SSH -r ppob deploy/setup.sh USER@45.66.153.148:~/
# di VPS:
sudo bash setup.sh
```

## 2. Firewall (ganti 22 dengan port SSH di dalam server dari langkah 0)
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
Kalau VPS di belakang NAT, port 80/443 juga harus di-forward di panel provider
(atau pakai Cloudflare Tunnel di bawah, yang tidak butuh port masuk sama sekali).

## 3a. HTTPS pakai Caddy (butuh port 80/443 terbuka dari luar)
```bash
sudo apt install -y caddy
sudo cp Caddyfile /etc/caddy/Caddyfile && sudo nano /etc/caddy/Caddyfile   # isi domain
sudo systemctl reload caddy
```
## 3b. ATAU Cloudflare Tunnel (cocok untuk VPS NAT; tidak perlu port masuk)
Tunnel -> Public hostname `ppob.domainmu.com` -> service `http://localhost:3000`.
Catatan: Tunnel hanya mengurus trafik MASUK. Panggilan KELUAR ke Digiflazz tetap
memakai IP 45.66.153.148, jadi whitelist tetap sah.

## 4. Digiflazz
1. Member area -> Koneksi API -> whitelist IP: `45.66.153.148`
2. Webhook URL: `https://ppob.domainmu.com/webhook/digiflazz`, secret = `DIGI_WEBHOOK_SECRET` di `.env`
3. Uji pakai Development Key + `TESTING=true` dulu. Setelah lolos:
   ganti `DIGI_KEY` ke Production Key, `TESTING=false`, lalu `sudo systemctl restart ppob`

## 5. Perintah harian
```bash
sudo systemctl status ppob
sudo journalctl -u ppob -f          # log
sudo nano /opt/ppob/.env && sudo systemctl restart ppob
ls /var/backups/ppob               # backup DB harian
```
Cek IP keluar berkala: `curl -4 ifconfig.me` (harus tetap 45.66.153.148).
