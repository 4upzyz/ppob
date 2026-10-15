require('dotenv').config();
const express = require('express'), crypto = require('crypto'), bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'), cookie = require('cookie-parser'), Database = require('better-sqlite3');

const E = process.env;
const DIGI_USER = E.DIGI_USER, DIGI_KEY = E.DIGI_KEY, TESTING = E.TESTING !== 'false';
const JWT_SECRET = E.JWT_SECRET || 'dev-secret-ganti';
const PCT = +(E.MARKUP_PERCENT || 3), FLAT = +(E.MARKUP_FLAT || 500);
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const digi = (path, body) => fetch('https://api.digiflazz.com/v1' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}).then(r => r.json());

/* ---------- database ---------- */
const db = new Database('ppob.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, pass TEXT, balance INTEGER DEFAULT 0, role TEXT DEFAULT 'user', created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(sku TEXT PRIMARY KEY, name TEXT, brand TEXT, category TEXT, type TEXT, cost INTEGER, price INTEGER, descr TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(ref_id TEXT PRIMARY KEY, user_id INTEGER, sku TEXT, name TEXT, customer_no TEXT, price INTEGER, status TEXT DEFAULT 'Pending', sn TEXT DEFAULT '', message TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS deposits(id INTEGER PRIMARY KEY, user_id INTEGER, amount INTEGER, code INTEGER, status TEXT DEFAULT 'Pending', created TEXT DEFAULT CURRENT_TIMESTAMP);
`);

/* ---------- sinkron produk ---------- */
async function syncProducts() {
  if (!DIGI_USER || !DIGI_KEY) throw new Error('DIGI_USER / DIGI_KEY belum diisi di .env');
  const r = await digi('/price-list', { cmd: 'prepaid', username: DIGI_USER, sign: md5(DIGI_USER + DIGI_KEY + 'pricelist') });
  if (!Array.isArray(r.data)) throw new Error((r.data && r.data.message) || 'Gagal ambil price list');
  const up = db.prepare(`INSERT INTO products(sku,name,brand,category,type,cost,price,descr,active) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(sku) DO UPDATE SET name=excluded.name,brand=excluded.brand,category=excluded.category,type=excluded.type,cost=excluded.cost,price=excluded.price,descr=excluded.descr,active=excluded.active`);
  db.transaction(list => list.forEach(p => {
    const price = Math.ceil((p.price * (1 + PCT / 100) + FLAT) / 100) * 100;
    const active = p.buyer_product_status && p.seller_product_status ? 1 : 0;
    up.run(p.buyer_sku_code, p.product_name, p.brand, p.category, p.type, p.price, price, p.desc || '', active);
  }))(r.data);
  return r.data.length;
}

/* ---------- status order (hanya Pending -> final, refund otomatis kalau Gagal) ---------- */
const applyStatus = db.transaction((ref, status, sn, msg) => {
  const o = db.prepare('SELECT * FROM orders WHERE ref_id=?').get(ref);
  if (!o || o.status !== 'Pending' || !['Sukses', 'Gagal'].includes(status)) return;
  db.prepare('UPDATE orders SET status=?,sn=?,message=? WHERE ref_id=?').run(status, sn || '', msg || '', ref);
  if (status === 'Gagal') db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(o.price, o.user_id);
});
const sendTx = o => digi('/transaction', {
  username: DIGI_USER, buyer_sku_code: o.sku, customer_no: o.customer_no, ref_id: o.ref_id,
  sign: md5(DIGI_USER + DIGI_KEY + o.ref_id), testing: TESTING
});

/* ---------- app ---------- */
const app = express();

// Webhook harus raw body untuk verifikasi signature
app.post('/webhook/digiflazz', express.raw({ type: '*/*' }), (req, res) => {
  const sig = 'sha1=' + crypto.createHmac('sha1', E.DIGI_WEBHOOK_SECRET || '').update(req.body).digest('hex');
  const got = req.get('X-Hub-Signature') || '';
  if (got.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(sig))) return res.sendStatus(401);
  try { const d = JSON.parse(req.body).data || {}; applyStatus(d.ref_id, d.status, d.sn, d.message); } catch {}
  res.sendStatus(200);
});

app.use(express.json(), cookie());
app.use(express.static('public'));

const auth = (req, res, next) => {
  try {
    const { id } = jwt.verify(req.cookies.token, JWT_SECRET);
    req.user = db.prepare('SELECT id,name,email,balance,role FROM users WHERE id=?').get(id);
    if (!req.user) throw 0;
    next();
  } catch { res.status(401).json({ error: 'Silakan login dulu' }); }
};
const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Khusus admin' });
const setToken = (res, id) => res.cookie('token', jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' }),
  { httpOnly: true, sameSite: 'lax', secure: E.NODE_ENV === 'production', maxAge: 7 * 864e5 });

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 6)
    return res.status(400).json({ error: 'Nama, email valid, dan password min. 6 karakter wajib diisi' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return res.status(400).json({ error: 'Email sudah terdaftar' });
  const role = E.ADMIN_EMAIL && E.ADMIN_EMAIL.toLowerCase() === email.toLowerCase() ? 'admin' : 'user';
  const id = db.prepare('INSERT INTO users(name,email,pass,role) VALUES(?,?,?,?)').run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), role).lastInsertRowid;
  setToken(res, id);
  res.json(db.prepare('SELECT id,name,email,balance,role FROM users WHERE id=?').get(id));
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.pass)) return res.status(400).json({ error: 'Email atau password salah' });
  setToken(res, u.id);
  res.json({ id: u.id, name: u.name, email: u.email, balance: u.balance, role: u.role });
});
app.post('/api/logout', (req, res) => res.clearCookie('token').json({ ok: 1 }));
app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/products', (req, res) =>
  res.json(db.prepare('SELECT sku,name,brand,category,type,price,descr FROM products WHERE active=1 ORDER BY brand,price').all()));

app.post('/api/order', auth, async (req, res) => {
  const { sku, customer_no } = req.body || {};
  const p = db.prepare('SELECT * FROM products WHERE sku=? AND active=1').get(sku);
  if (!p || !/^[\w.\-@ ]{3,60}$/.test(customer_no || '')) return res.status(400).json({ error: 'Produk atau nomor tujuan tidak valid' });
  const o = { ref_id: 'TRX' + Date.now() + crypto.randomBytes(3).toString('hex'), sku, customer_no: customer_no.trim() };
  try {
    db.transaction(() => {
      const u = db.prepare('SELECT balance FROM users WHERE id=?').get(req.user.id);
      if (u.balance < p.price) throw new Error('Saldo tidak cukup, silakan deposit dulu');
      db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(p.price, req.user.id);
      db.prepare('INSERT INTO orders(ref_id,user_id,sku,name,customer_no,price) VALUES(?,?,?,?,?,?)').run(o.ref_id, req.user.id, sku, p.name, o.customer_no, p.price);
    })();
  } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const d = (await sendTx(o)).data || {};
    if (d.status) applyStatus(o.ref_id, d.status, d.sn, d.message);
  } catch { /* tetap Pending, nanti dikonfirmasi webhook / tombol cek status */ }
  res.json({ order: db.prepare('SELECT * FROM orders WHERE ref_id=?').get(o.ref_id), balance: db.prepare('SELECT balance FROM users WHERE id=?').get(req.user.id).balance });
});
app.post('/api/orders/:ref/refresh', auth, async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE ref_id=? AND user_id=?').get(req.params.ref, req.user.id);
  if (!o) return res.status(404).json({ error: 'Order tidak ditemukan' });
  if (o.status === 'Pending') try { const d = (await sendTx(o)).data || {}; applyStatus(o.ref_id, d.status, d.sn, d.message); } catch {}
  res.json(db.prepare('SELECT * FROM orders WHERE ref_id=?').get(o.ref_id));
});
app.get('/api/orders', auth, (req, res) => res.json(db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 50').all(req.user.id)));

/* deposit manual: transfer + kode unik, dikonfirmasi admin */
app.post('/api/deposit', auth, (req, res) => {
  const amount = Math.floor(+req.body.amount);
  if (!(amount >= 10000 && amount <= 10000000)) return res.status(400).json({ error: 'Nominal deposit Rp 10.000 - Rp 10.000.000' });
  const code = 1 + crypto.randomInt(999);
  const id = db.prepare('INSERT INTO deposits(user_id,amount,code) VALUES(?,?,?)').run(req.user.id, amount, code).lastInsertRowid;
  res.json({ id, amount, code, total: amount + code, bank: E.BANK_INFO || 'Hubungi admin' });
});
app.get('/api/deposits', auth, (req, res) => res.json(db.prepare('SELECT * FROM deposits WHERE user_id=? ORDER BY created DESC LIMIT 50').all(req.user.id)));

/* admin */
app.get('/api/admin/deposits', auth, admin, (req, res) => res.json(db.prepare(
  `SELECT d.*,u.email FROM deposits d JOIN users u ON u.id=d.user_id WHERE d.status='Pending' ORDER BY d.id DESC`).all()));
app.post('/api/admin/deposits/:id/approve', auth, admin, (req, res) => {
  const ok = db.transaction(() => {
    const d = db.prepare("SELECT * FROM deposits WHERE id=? AND status='Pending'").get(req.params.id);
    if (!d) return false;
    db.prepare("UPDATE deposits SET status='Sukses' WHERE id=?").run(d.id);
    db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(d.amount, d.user_id);
    return true;
  })();
  res.json({ ok });
});
app.post('/api/admin/sync', auth, admin, async (req, res) => {
  try { res.json({ count: await syncProducts() }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/saldo', auth, admin, async (req, res) => {
  try {
    const r = await digi('/cek-saldo', { cmd: 'deposit', username: DIGI_USER, sign: md5(DIGI_USER + DIGI_KEY + 'depo') });
    res.json({ deposit: r.data && r.data.deposit });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.listen(E.PORT || 3000, () => {
  console.log('PPOB jalan di http://localhost:' + (E.PORT || 3000) + (TESTING ? '  [MODE TESTING]' : ''));
  if (DIGI_USER && DIGI_KEY) {
    const run = () => syncProducts().then(n => console.log('Sync produk:', n), e => console.log('Sync gagal:', e.message));
    run(); setInterval(run, 30 * 60 * 1000);
  } else console.log('! Isi DIGI_USER & DIGI_KEY di .env untuk memuat produk');
});
