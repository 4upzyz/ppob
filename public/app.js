(() => {
const api = async (url, o = {}) => {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...o, body: o.body && JSON.stringify(o.body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan');
  return j;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const idr = n => 'Rp ' + Number(n).toLocaleString('id-ID');
let me = null, brands = new Map();

/* ---- style & modal ---- */
document.head.insertAdjacentHTML('beforeend', `<style>
#pm{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:100;padding:16px}
#pm.show{display:flex}
.pm-box{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:20px;width:min(460px,100%);max-height:88vh;overflow:auto;position:relative}
.pm-x{position:absolute;top:10px;right:12px;background:none;border:0;font-size:18px;cursor:pointer}
.pm-box h3{margin-bottom:12px}.pm-box label.l{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}
.pm-box input[type=text],.pm-box input[type=email],.pm-box input[type=password],.pm-box input[type=number]{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:15px}
.skus{margin-top:12px;max-height:260px;overflow:auto;display:grid;gap:6px}
.sku{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:14px}
.sku span{flex:1}.sku:has(input:checked){border-color:var(--accent)}
.pbtn,.sbtn{margin-top:14px;width:100%;padding:12px;border:0;border-radius:12px;background:var(--accent);color:#fff;font-weight:800;font-size:15px;cursor:pointer}
.sbtn{background:var(--card2);color:var(--text);margin-top:6px;padding:9px;font-weight:600;font-size:13px}
#pm-msg{margin-top:10px;font-size:14px}.err{color:#ff5470}.ok{color:#2ecc71}
.acct{padding:10px 0;border-bottom:1px solid var(--border)}.acct .bal{font-size:20px;font-weight:800;color:var(--accent2);margin:2px 0 6px}
.hrow{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
.hrow small{color:var(--muted);display:block}
</style>`);
const pm = document.createElement('div');
pm.id = 'pm'; pm.innerHTML = '<div class="pm-box"><button class="pm-x" aria-label="Tutup">✕</button><div id="pm-c"></div></div>';
document.body.appendChild(pm);
const show = h => { pm.querySelector('#pm-c').innerHTML = h; pm.classList.add('show'); };
const hide = () => pm.classList.remove('show');
const msg = (t, ok) => { const m = pm.querySelector('#pm-msg'); if (m) { m.className = ok ? 'ok' : 'err'; m.textContent = t; } };
pm.addEventListener('click', e => { if (e.target === pm || e.target.classList.contains('pm-x')) hide(); });

/* ---- akun ---- */
function renderAcct() {
  document.querySelector('#acct').innerHTML = me
    ? `<div class="acct"><b>${esc(me.name)}</b><div class="bal">${idr(me.balance)}</div>
       <button class="sbtn" data-a="dep">+ Deposit Saldo</button><button class="sbtn" data-a="hist">Riwayat</button>
       ${me.role === 'admin' ? '<a class="sbtn" style="display:block;text-align:center;border:0" href="/admin.html">Panel Admin</a>' : ''}
       <button class="sbtn" data-a="out">Keluar</button></div>`
    : `<div class="acct"><button class="pbtn" style="margin:0" data-a="login">Masuk / Daftar</button></div>`;
}
const setMe = u => { me = u; renderAcct(); };

function authModal(reg) {
  show(`<h3>${reg ? 'Daftar Akun' : 'Masuk'}</h3>
    ${reg ? '<label class="l">Nama</label><input type="text" id="an">' : ''}
    <label class="l">Email</label><input type="email" id="ae"><label class="l">Password</label><input type="password" id="ap">
    <button class="pbtn" id="ago">${reg ? 'Daftar' : 'Masuk'}</button><p id="pm-msg"></p>
    <button class="sbtn" id="asw">${reg ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>`);
  pm.querySelector('#asw').onclick = () => authModal(!reg);
  pm.querySelector('#ago').onclick = async () => {
    try {
      const v = id => pm.querySelector(id)?.value;
      setMe(await api(reg ? '/api/register' : '/api/login', { method: 'POST', body: { name: v('#an'), email: v('#ae'), password: v('#ap') } }));
      hide();
    } catch (e) { msg(e.message); }
  };
}

/* ---- beli ---- */
function openBrand(name) {
  const b = brands.get(name); if (!b) return;
  show(`<h3>${esc(name)}</h3><label class="l">Nomor HP / ID pelanggan / ID game</label>
    <input type="text" id="cn" placeholder="Masukkan nomor tujuan">
    <div class="skus">${b.skus.map((s, i) => `<label class="sku"><input type="radio" name="sku" value="${esc(s.sku)}" ${i ? '' : 'checked'}><span>${esc(s.name)}</span><b>${idr(s.price)}</b></label>`).join('')}</div>
    <button class="pbtn" id="buy">Beli Sekarang</button><p id="pm-msg"></p>`);
  pm.querySelector('#buy').onclick = async () => {
    if (!me) return authModal(false);
    const btn = pm.querySelector('#buy'); btn.disabled = true;
    try {
      const r = await api('/api/order', { method: 'POST', body: { sku: pm.querySelector('input[name=sku]:checked').value, customer_no: pm.querySelector('#cn').value } });
      me.balance = r.balance; renderAcct();
      const o = r.order;
      msg(`${o.status}: ${o.name}${o.sn ? ' • SN ' + o.sn : ''}${o.status === 'Pending' ? ' (diproses, cek di Riwayat)' : ''}`, o.status !== 'Gagal');
    } catch (e) { msg(e.message); }
    btn.disabled = false;
  };
}

/* ---- deposit & riwayat ---- */
function depositModal() {
  show(`<h3>Deposit Saldo</h3><label class="l">Nominal (min. Rp 10.000)</label><input type="number" id="da" value="50000" step="1000">
    <button class="pbtn" id="dgo">Buat Tagihan</button><p id="pm-msg"></p>`);
  pm.querySelector('#dgo').onclick = async () => {
    try {
      const d = await api('/api/deposit', { method: 'POST', body: { amount: pm.querySelector('#da').value } });
      pm.querySelector('#pm-c').innerHTML = `<h3>Transfer Tepat</h3><div class="bal" style="font-size:26px;font-weight:800;color:var(--accent2)">${idr(d.total)}</div>
        <p style="margin:8px 0">ke <b>${esc(d.bank)}</b></p><p style="color:var(--muted);font-size:13px">Termasuk kode unik ${d.code}. Saldo ${idr(d.amount)} masuk setelah admin mengonfirmasi pembayaran.</p>`;
    } catch (e) { msg(e.message); }
  };
}
async function historyModal() {
  const [o, d] = await Promise.all([api('/api/orders'), api('/api/deposits')]);
  show(`<h3>Riwayat Transaksi</h3>${o.map(x => `<div class="hrow"><div><b>${esc(x.name)}</b><small>${esc(x.customer_no)} • ${esc(x.created)}${x.sn ? ' • SN ' + esc(x.sn) : ''}</small></div>
      <div style="text-align:right">${idr(x.price)}<small>${x.status}</small>${x.status === 'Pending' ? `<button class="sbtn" style="padding:4px 8px;margin:2px 0 0" data-ref="${esc(x.ref_id)}">Cek status</button>` : ''}</div></div>`).join('') || '<p>Belum ada order.</p>'}
    <h3 style="margin-top:16px">Deposit</h3>${d.map(x => `<div class="hrow"><div>${idr(x.amount)}<small>${esc(x.created)}</small></div><div>${x.status}</div></div>`).join('') || '<p>Belum ada deposit.</p>'}`);
}

/* ---- klik ---- */
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a) {
    if (typeof closeD === 'function') closeD();
    if (a === 'login') authModal(false);
    if (a === 'dep') depositModal();
    if (a === 'hist') historyModal().catch(x => alert(x.message));
    if (a === 'out') { await api('/api/logout', { method: 'POST' }); setMe(null); }
    return;
  }
  const ref = e.target.dataset.ref;
  if (ref) { try { await api(`/api/orders/${ref}/refresh`, { method: 'POST' }); me = await api('/api/me'); renderAcct(); historyModal(); } catch (x) { alert(x.message); } return; }
  const it = e.target.closest('#grid .item');
  if (it) openBrand(it.querySelector('.info b').textContent);
});

/* ---- produk dari backend ---- */
const pal = ['#6c4cf1,#9b6bff', '#ff7a1a,#ff4d6d', '#2ec4b6,#3a86ff', '#f72585,#7209b7', '#4361ee,#4cc9f0', '#06d6a0,#118ab2', '#e9a100,#ff7a1a', '#ef476f,#ffd166'];
const color = s => pal[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % pal.length];
const ini = s => s.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const cat = c => /game/i.test(c) ? 'Game' : /voucher/i.test(c) ? 'Voucher' : /pulsa|data/i.test(c) ? 'Pulsa' : /money/i.test(c) ? 'E-Money' : 'Lainnya';
async function loadProducts() {
  const list = await api('/api/products');
  if (!list.length) return;   // belum ada sync: tetap tampilkan demo
  brands = new Map();
  list.forEach(p => { if (!brands.has(p.brand)) brands.set(p.brand, { cat: cat(p.category), skus: [] }); brands.get(p.brand).skus.push(p); });
  products.splice(0, products.length, ...[...brands].map(([n, b]) => [n, b.cat, color(n), ini(n), '']));
  renderGrid();
}

renderAcct();
api('/api/me').then(setMe).catch(() => {});
loadProducts().catch(() => {});
})();
