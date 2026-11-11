import { esc, md, money, totals, sumMoney } from './domain.js';

const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

export function layout({ title, body, user, active = '', bare = false }) {
  const nav = bare ? '' : `<div class="wrap nav">
    <a class="brand" href="${user ? '/app' : '/'}"><i></i>Closewise</a>
    <nav>${user
      ? `<a href="/app" class="${active === 'dash' ? 'on' : ''}">Proposals</a>
         <a href="/app/connect" class="${active === 'connect' ? 'on' : ''}">Connect Claude</a>
         <span class="muted small">${esc(user.email)}</span>
         <form method="post" action="/logout" style="margin:0"><button class="btn sm">Log out</button></form>`
      : `<a href="/login">Log in</a><a class="btn primary" href="/signup">Start free</a>`}</nav></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Closewise</title>${fonts}<link rel="stylesheet" href="/app.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%230d7a5f'/><path d='M9 16.5l5 5 9-11' stroke='white' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>">
</head><body>${nav}${body}</body></html>`;
}

export const landing = (user) => layout({ title: 'Proposals that close themselves', user, body: `
<div class="wrap">
  <section class="hero">
    <div>
      <div class="kicker">For freelancers, studios & agencies</div>
      <h1>Your Claude writes the proposal. Closewise gets it signed.</h1>
      <p class="lead">Ask Claude for a proposal in plain words. It lands in Closewise as a polished, priced document. Tweak it, send one link, see when your client opens it, and get an e-signature, all in one place.</p>
      <p style="display:flex;gap:10px;margin-top:26px"><a class="btn go" href="/signup">Create free account</a><a class="btn" href="/login?demo=1">Try the demo account</a></p>
      <p class="muted small">No AI bill on our side: it runs on the Claude plan you already pay for.</p>
    </div>
    <div class="chat">
      <div class="bubble me">Draft a proposal for Priya at Bloom Bakery: new Shopify site, 6 pages, brand refresh, ₹2.4L budget, 4 weeks. Put it in Closewise.</div>
      <div class="bubble"><b>Claude</b> · Used <span class="tag">closewise · create_proposal</span><br>Done. "Website & brand refresh for Bloom Bakery" is saved as a draft: 5 sections, 6 line items, total ₹2,36,000 incl. GST. Review it here → <u>closewise/app/p/…</u></div>
      <div class="bubble me">Looks good, publish it.</div>
      <div class="bubble"><b>Claude</b> · Live. Send Priya this link: <u>closewise/p/…</u></div>
    </div>
  </section>
  <div class="steps">
    <div class="card"><div class="num">1</div><h3>Claude drafts</h3><p class="muted">Scope, timeline, priced line items and terms, written by the Claude you already use, from your notes, calls or emails.</p></div>
    <div class="card"><div class="num">2</div><h3>You polish</h3><p class="muted">Everything lands in an editor. Change a price, reword a section, add a discount. Totals and tax recalculate instantly.</p></div>
    <div class="card"><div class="num">3</div><h3>Client signs</h3><p class="muted">One link, no login for your client. You see when they open it, and they accept with a signature. Claude can check status for you.</p></div>
  </div>
</div>` });

export const authPage = ({ mode, error, demo, values = {} }) => layout({ title: mode === 'login' ? 'Log in' : 'Sign up', body: `
<div class="wrap" style="max-width:440px;padding-top:40px">
  <div class="card">
    <h2>${mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
    <p class="muted">${mode === 'login' ? 'Log in to your proposals.' : 'Free while in beta. Takes 20 seconds.'}</p>
    ${demo ? `<div class="ok">Demo account is pre-filled. Just press Log in.</div>` : ''}
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <form method="post" action="/${mode}">
      ${mode === 'signup' ? `<div class="field"><label>Your name</label><input name="name" value="${esc(values.name)}" required></div>
      <div class="field"><label>Business name (shown on proposals)</label><input name="business" value="${esc(values.business)}" placeholder="e.g. Northwind Studio"></div>` : ''}
      <div class="field"><label>Email</label><input name="email" type="email" value="${esc(values.email || (demo ? 'demo@closewise.app' : ''))}" required></div>
      <div class="field"><label>Password</label><input name="password" type="password" value="${demo ? 'demo1234' : ''}" required></div>
      <button class="btn primary" style="width:100%;justify-content:center">${mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>
    <p class="small muted" style="margin-top:16px">${mode === 'login' ? `New here? <a href="/signup">Create an account</a> · <a href="/login?demo=1">Use demo</a>` : `Already have an account? <a href="/login">Log in</a>`}</p>
  </div>
</div>` });

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function dashboard(user, list) {
  const open = list.filter((p) => ['sent', 'viewed'].includes(p.status));
  const won = list.filter((p) => p.status === 'accepted');
  const decided = list.filter((p) => ['accepted', 'declined'].includes(p.status));
  const rows = list.map((p) => `<tr class="row" onclick="location='/app/p/${p.id}'">
    <td><b>${esc(p.title)}</b> ${p.source === 'claude' ? '<span class="tag">by Claude</span>' : ''}<div class="muted small">${esc(p.client.name)}${p.client.company ? ' · ' + esc(p.client.company) : ''}</div></td>
    <td><span class="pill ${p.status}">${p.status}</span></td>
    <td>${money(totals(p).total, p.currency)}</td>
    <td>${p.view_count || 0}</td>
    <td class="muted small">${fmtDate(p.updated_at)}</td></tr>`).join('');
  return layout({ title: 'Proposals', user, active: 'dash', body: `
<div class="wrap">
  <div style="display:flex;align-items:end;justify-content:space-between;margin:10px 0 18px">
    <div><h1 style="font-size:34px">Proposals</h1><div class="muted">Ask Claude to draft one, or start from scratch.</div></div>
    <form method="post" action="/app/new"><button class="btn primary">+ New proposal</button></form>
  </div>
  <div class="stats">
    <div class="card stat"><div class="v">${sumMoney(open)}</div><div class="l">Open pipeline (${open.length})</div></div>
    <div class="card stat"><div class="v">${sumMoney(won)}</div><div class="l">Won (${won.length})</div></div>
    <div class="card stat"><div class="v">${decided.length ? Math.round((won.length / decided.length) * 100) + '%' : '—'}</div><div class="l">Win rate</div></div>
    <div class="card stat"><div class="v">${list.filter((p) => p.status === 'draft').length}</div><div class="l">Drafts to review</div></div>
  </div>
  ${list.length ? `<table class="list"><thead><tr><th>Proposal</th><th>Status</th><th>Value</th><th>Views</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="card empty"><h3>No proposals yet</h3><p class="muted">Connect Claude, then ask it: <i>"Draft a proposal for … and put it in Closewise."</i></p><a class="btn go" href="/app/connect">Connect Claude</a></div>`}
</div>` });
}

export function connectPage(user, mcpUrl) {
  return layout({ title: 'Connect Claude', user, active: 'connect', body: `
<div class="wrap" style="max-width:760px">
  <h1 style="font-size:34px;margin-top:10px">Connect your Claude</h1>
  <p class="muted">Closewise has no AI inside. Your own Claude does the writing and uses this connector to save proposals into your workspace.</p>
  <div class="card" style="margin:18px 0">
    <label>Your private connector URL</label>
    <div class="copybox"><input id="u" readonly value="${esc(mcpUrl)}"><button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('u').value);this.textContent='Copied'">Copy</button></div>
    <p class="small muted" style="margin:8px 0 0">Treat it like a password: anyone with this link can create proposals in your workspace.</p>
  </div>
  <div class="card">
    <h3>Claude (web or desktop)</h3>
    <ol>
      <li>Open <b>Settings → Connectors</b> in Claude.</li>
      <li>Click <b>Add custom connector</b>. Name: <code>Closewise</code>. URL: paste the link above. Click <b>Add</b>.</li>
      <li>In a new chat, open the <b>+ / tools</b> menu and make sure <b>Closewise</b> is switched on.</li>
      <li>Ask: <i>"Draft a proposal for Priya at Bloom Bakery for a 6-page website and brand refresh, budget ₹2.4 lakh, 4 weeks. Save it to Closewise."</i></li>
    </ol>
    <h3 style="margin-top:22px">Things to ask Claude</h3>
    <ul class="muted">
      <li>"Turn these call notes into a proposal in Closewise." (paste notes)</li>
      <li>"Add an optional SEO retainer at $400/month to the Bloom proposal."</li>
      <li>"Publish the Bloom proposal and give me the client link."</li>
      <li>"Which of my proposals have been viewed but not signed?"</li>
    </ul>
    <h3 style="margin-top:22px">Claude Code</h3>
    <pre class="mono" style="background:#faf9f6;padding:12px;border-radius:8px;overflow:auto">claude mcp add --transport http closewise ${esc(mcpUrl)}</pre>
  </div>
</div>` });
}

export function editor(user, p, clientUrl) {
  const data = JSON.stringify({
    id: p.id, status: p.status, title: p.title, client: p.client, summary: p.summary, sections: p.sections,
    items: p.items, currency: p.currency, tax_pct: p.tax_pct, discount_pct: p.discount_pct,
    valid_until: p.valid_until, terms: p.terms, from_name: p.from_name,
  }).replace(/</g, '\\u003c');
  const locked = ['accepted', 'declined'].includes(p.status);
  const timeline = [...p.activity].reverse().map((a) => `<li>${esc(a.text)}<time>${fmtDate(a.at)}</time></li>`).join('');
  return layout({ title: p.title, user, active: 'dash', body: `
<div class="edbar"><div class="wrap">
  <a href="/app" class="btn sm">← All</a>
  <span class="pill ${p.status}">${p.status}</span>
  <span class="grow"></span>
  <span class="saved" id="saved"></span>
  <a class="btn sm" href="/app/preview/${p.id}" target="_blank">Preview</a>
  ${locked ? '' : `<button class="btn sm primary" id="save">Save</button>`}
  ${p.status === 'draft' ? `<form method="post" action="/app/p/${p.id}/publish" style="margin:0" onsubmit="return window.__beforePublish()"><button class="btn sm go">Publish & get link</button></form>` : ''}
</div></div>
<div class="wrap edgrid">
  <div>
    ${locked ? `<div class="locked">This proposal was <b>${p.status}</b> by the client and is now locked as a record.</div>` : ''}
    <div class="card" id="ed">
      <div class="field"><label>Proposal title</label><input data-k="title" style="font-size:20px;font-weight:600"></div>
      <div class="grid3">
        <div class="field"><label>Client name</label><input data-k="client.name"></div>
        <div class="field"><label>Client company</label><input data-k="client.company"></div>
        <div class="field"><label>Client email</label><input data-k="client.email" type="email"></div>
      </div>
      <div class="grid3">
        <div class="field"><label>From (your business)</label><input data-k="from_name"></div>
        <div class="field"><label>Valid until</label><input data-k="valid_until" type="date"></div>
        <div class="field"><label>Currency</label><input data-k="currency" maxlength="3" placeholder="USD"></div>
      </div>
      <div class="field"><label>Summary</label><textarea data-k="summary" rows="3"></textarea></div>
      <h3 style="margin-top:20px">Sections</h3>
      <div id="sections"></div>
      <button class="btn sm" id="addSec" type="button">+ Add section</button>
      <h3 style="margin-top:26px">Pricing</h3>
      <table class="items"><thead><tr><th>Description</th><th style="width:80px">Qty</th><th style="width:130px">Unit price</th><th style="width:70px">Optional</th><th class="r" style="width:120px">Amount</th><th></th></tr></thead><tbody id="items"></tbody></table>
      <button class="btn sm" id="addItem" type="button" style="margin-top:8px">+ Add line item</button>
      <div class="grid2" style="max-width:340px;margin-top:16px">
        <div class="field"><label>Discount %</label><input data-k="discount_pct" type="number" min="0" max="100" step="0.5"></div>
        <div class="field"><label>Tax %</label><input data-k="tax_pct" type="number" min="0" max="100" step="0.5"></div>
      </div>
      <div class="tot" id="tot"></div>
      <div class="field" style="margin-top:20px"><label>Terms & payment</label><textarea data-k="terms" rows="4"></textarea></div>
      <p class="small muted">Tip: section text supports simple formatting: blank line for a new paragraph, "- " for bullets, **bold**.</p>
    </div>
  </div>
  <aside class="side">
    <div class="card">
      <label>Client link</label>
      ${p.status === 'draft' ? `<p class="small muted" style="margin:0">Publish to make the link live for your client.</p>` :
      `<div class="copybox"><input id="cl" readonly value="${esc(clientUrl)}"><button class="btn sm" onclick="navigator.clipboard.writeText(document.getElementById('cl').value);this.textContent='Copied'">Copy</button></div>
       <p class="small" style="margin:8px 0 0"><a href="${esc(clientUrl)}" target="_blank">Open as client ↗</a></p>`}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between"><span class="muted small">Client views</span><b>${p.view_count || 0}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="muted small">Last viewed</span><span class="small">${fmtDate(p.last_viewed_at)}</span></div>
      ${p.decision ? `<div style="margin-top:10px" class="small"><b>${p.decision.action === 'accept' ? 'Signed by' : 'Declined by'}</b> ${esc(p.decision.name || 'client')}<br><span class="muted">${fmtDate(p.decision.at)}</span>${p.decision.note ? `<br>"${esc(p.decision.note)}"` : ''}</div>` : ''}
    </div>
    <div class="card"><label>Activity</label><ul class="timeline">${timeline}</ul></div>
    ${locked ? '' : `<form method="post" action="/app/p/${p.id}/delete" onsubmit="return confirm('Delete this proposal?')"><button class="btn sm danger">Delete proposal</button></form>`}
  </aside>
</div>
<script>window.__P=${data};window.__LOCKED=${locked};</script>
<script src="/editor.js"></script>` });
}

export function clientView(p, { preview = false, error = '', owner = null } = {}) {
  const t = totals(p);
  const items = p.items.map((i) => `<tr class="${i.optional ? 'opt' : ''}"><td>${esc(i.description)}${i.optional ? ' <span class="muted small">(optional)</span>' : ''}</td><td class="r">${i.qty}</td><td class="r">${money(i.unit_price, p.currency)}</td><td class="r">${money(i.qty * i.unit_price, p.currency)}</td></tr>`).join('');
  const sections = p.sections.map((s) => `<h2>${esc(s.heading)}</h2>${md(s.body)}`).join('');
  const expired = p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10);
  let sign;
  if (p.status === 'accepted') {
    sign = `<div class="done"><div class="pill accepted" style="font-size:14px">Accepted</div><div><div class="sig">${esc(p.decision.name)}</div><div class="muted small">Signed electronically on ${new Date(p.decision.at).toUTCString()}</div></div></div>`;
  } else if (p.status === 'declined') {
    sign = `<div class="pill declined" style="font-size:14px">Declined</div> <span class="muted small">on ${new Date(p.decision.at).toUTCString()}</span>`;
  } else if (preview) {
    sign = `<p class="muted">Your client will see an <b>Accept & sign</b> box here.</p>`;
  } else if (expired) {
    sign = `<p class="muted">This proposal expired on ${esc(p.valid_until)}. Please contact ${esc(p.from_name)} for an updated version.</p>`;
  } else {
    sign = `<h3>Ready to go ahead?</h3>
    <p class="muted">Type your full name to accept this proposal for <b>${money(t.total, p.currency)}</b>. This acts as your electronic signature.</p>
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <form method="post" action="/p/${p.slug}/decide">
      <div class="grid2"><div class="field"><label>Full name</label><input name="name" placeholder="${esc(p.client.name || 'Your name')}"></div>
      <div class="field"><label>Note (optional)</label><input name="note" placeholder="Anything we should know?"></div></div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="agree" value="1" style="width:auto" required> I agree to the scope, pricing and terms above.</label>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn go" name="action" value="accept">Accept & sign</button>
      <button class="btn" name="action" value="decline" formnovalidate onclick="return confirm('Decline this proposal?')">Decline</button></div>
    </form>`;
  }
  return layout({ title: p.title, bare: true, body: `
${preview ? `<div class="banner">Preview — this is exactly what your client sees. <a href="/app/p/${p.id}">Back to editor</a></div>` : ''}
${owner && !preview ? `<div class="banner">You are viewing your own proposal; your visits are not counted. <a href="/app/p/${p.id}">Open editor</a></div>` : ''}
<article class="doc">
  <header>
    <div class="from">${esc(p.from_name || 'Proposal')}</div>
    <h1>${esc(p.title)}</h1>
    <div class="meta">
      <div><b>Prepared for</b>${esc(p.client.name)}${p.client.company ? ', ' + esc(p.client.company) : ''}</div>
      <div><b>Total</b>${money(t.total, p.currency)}</div>
      <div><b>Valid until</b>${esc(p.valid_until || '—')}</div>
      <div class="noprint"><b>&nbsp;</b><a href="#" onclick="print();return false">Download PDF</a></div>
    </div>
  </header>
  <div class="body">
    ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
    ${sections}
    ${p.items.length ? `<h2>Investment</h2>
    <table class="price"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${items}</tbody></table>
    <div class="tot" style="margin-top:14px">
      <div><span>Subtotal</span><span>${money(t.subtotal, p.currency)}</span></div>
      ${t.discount ? `<div><span>Discount (${p.discount_pct}%)</span><span>−${money(t.discount, p.currency)}</span></div>` : ''}
      ${t.tax ? `<div><span>Tax (${p.tax_pct}%)</span><span>${money(t.tax, p.currency)}</span></div>` : ''}
      <div class="big"><span>Total</span><span>${money(t.total, p.currency)}</span></div>
    </div>` : ''}
    ${p.terms ? `<h2>Terms</h2>${md(p.terms)}` : ''}
  </div>
  <section class="sign">${sign}</section>
</article>
<p class="foot">Sent with <a href="/">Closewise</a></p>` });
}

export const notFound = () => layout({ title: 'Not found', bare: true, body: `<div class="wrap" style="text-align:center;padding:100px 0"><h1>Not available</h1><p class="muted">This proposal doesn't exist or hasn't been published yet.</p></div>` });
