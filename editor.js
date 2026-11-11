// Proposal editor: plain JavaScript, no AI.
(() => {
  const P = window.__P, LOCKED = window.__LOCKED;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 8);
  const fmt = (n) => { try { return new Intl.NumberFormat(P.currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: P.currency || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch { return (P.currency || '') + ' ' + n.toFixed(2); } };
  let dirty = false, timer;

  const getK = (k) => k.split('.').reduce((o, x) => o?.[x], P);
  const setK = (k, v) => { const ks = k.split('.'); const last = ks.pop(); ks.reduce((o, x) => o[x], P)[last] = v; };

  document.querySelectorAll('[data-k]').forEach((el) => {
    el.value = getK(el.dataset.k) ?? '';
    el.disabled = LOCKED;
    el.addEventListener('input', () => { setK(el.dataset.k, el.type === 'number' ? Number(el.value) : el.value); changed(); });
  });

  function renderSections() {
    $('#sections').innerHTML = P.sections.map((s, i) => `
      <div class="sec" data-i="${i}">
        <div class="head"><input data-f="heading" value="${esc(s.heading)}" placeholder="Section heading" style="font-weight:600">
          <button class="iconbtn" data-a="up" title="Move up" type="button">↑</button><button class="iconbtn" data-a="down" title="Move down" type="button">↓</button><button class="iconbtn" data-a="del" title="Remove" type="button">×</button></div>
        <textarea data-f="body" rows="${Math.min(14, Math.max(3, (s.body.match(/\n/g) || []).length + 2))}" placeholder="Write this section…">${esc(s.body)}</textarea>
      </div>`).join('') || '<p class="muted small">No sections yet.</p>';
    if (LOCKED) $('#sections').querySelectorAll('input,textarea,button').forEach((e) => (e.disabled = true));
  }
  $('#sections').addEventListener('input', (e) => {
    const box = e.target.closest('.sec'); if (!box) return;
    P.sections[box.dataset.i][e.target.dataset.f] = e.target.value; changed();
  });
  $('#sections').addEventListener('click', (e) => {
    const a = e.target.dataset.a; if (!a) return;
    const i = Number(e.target.closest('.sec').dataset.i), S = P.sections;
    if (a === 'del') S.splice(i, 1);
    if (a === 'up' && i > 0) [S[i - 1], S[i]] = [S[i], S[i - 1]];
    if (a === 'down' && i < S.length - 1) [S[i + 1], S[i]] = [S[i], S[i + 1]];
    renderSections(); changed();
  });
  $('#addSec').onclick = () => { P.sections.push({ id: 's_' + uid(), heading: 'New section', body: '' }); renderSections(); changed(); };

  function renderItems() {
    $('#items').innerHTML = P.items.map((it, i) => `
      <tr data-i="${i}">
        <td><input data-f="description" value="${esc(it.description)}" placeholder="What's included"></td>
        <td><input data-f="qty" type="number" min="0" step="any" value="${it.qty}"></td>
        <td><input data-f="unit_price" type="number" min="0" step="any" value="${it.unit_price}"></td>
        <td style="text-align:center"><input data-f="optional" type="checkbox" style="width:auto;margin-top:10px" ${it.optional ? 'checked' : ''}></td>
        <td class="r" style="padding-top:12px" data-amt>${fmt(it.qty * it.unit_price)}</td>
        <td><button class="iconbtn" data-a="del" type="button">×</button></td>
      </tr>`).join('');
    if (LOCKED) $('#items').querySelectorAll('input,button').forEach((e) => (e.disabled = true));
    renderTotals();
  }
  $('#items').addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); const it = P.items[tr.dataset.i]; const f = e.target.dataset.f;
    it[f] = f === 'description' ? e.target.value : f === 'optional' ? e.target.checked : Number(e.target.value) || 0;
    $('[data-amt]', tr).textContent = fmt(it.qty * it.unit_price);
    renderTotals(); changed();
  });
  $('#items').addEventListener('click', (e) => {
    if (e.target.dataset.a !== 'del') return;
    P.items.splice(Number(e.target.closest('tr').dataset.i), 1); renderItems(); changed();
  });
  $('#addItem').onclick = () => { P.items.push({ id: 'i_' + uid(), description: '', qty: 1, unit_price: 0, optional: false }); renderItems(); changed(); };
  if (LOCKED) { $('#addSec').disabled = true; $('#addItem').disabled = true; }

  function renderTotals() {
    const sub = P.items.filter((i) => !i.optional).reduce((s, i) => s + i.qty * i.unit_price, 0);
    const disc = sub * (Number(P.discount_pct) || 0) / 100;
    const tax = (sub - disc) * (Number(P.tax_pct) || 0) / 100;
    $('#tot').innerHTML = `<div><span>Subtotal</span><span>${fmt(sub)}</span></div>` +
      (disc ? `<div><span>Discount</span><span>−${fmt(disc)}</span></div>` : '') +
      (tax ? `<div><span>Tax</span><span>${fmt(tax)}</span></div>` : '') +
      `<div class="big"><span>Total</span><span>${fmt(sub - disc + tax)}</span></div>`;
  }

  function changed() {
    if (LOCKED) return;
    dirty = true; $('#saved').textContent = 'Unsaved changes';
    renderTotals();
    clearTimeout(timer); timer = setTimeout(save, 1500);
  }
  async function save() {
    if (!dirty || LOCKED) return true;
    clearTimeout(timer);
    $('#saved').textContent = 'Saving…';
    const r = await fetch('/api/proposals/' + P.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(P) });
    if (r.ok) { dirty = false; $('#saved').textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); return true; }
    const j = await r.json().catch(() => ({})); $('#saved').textContent = j.error || 'Could not save'; return false;
  }
  if ($('#save')) $('#save').onclick = save;
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.__beforePublish = () => {
    if (!dirty) return true;
    save().then((ok) => { if (ok) document.querySelector('form[action$="/publish"]').submit(); });
    return false;
  };

  renderSections(); renderItems();
})();
