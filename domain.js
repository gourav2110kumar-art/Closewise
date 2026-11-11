// Business logic for users and proposals. Plain code, no AI.
import crypto from 'node:crypto';
import { store } from './store.js';

export const rid = (n = 10) => crypto.randomBytes(16).toString('base64url').replace(/[-_]/g, '').slice(0, n);
export const now = () => new Date().toISOString();

// ---------- users ----------
export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
export function checkPassword(user, pw) {
  const { hash } = hashPassword(pw, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}
export async function createUser({ email, password, name, business, mcpKey }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Please enter a valid email.');
  if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters.');
  if (await store.findOne('users', (u) => u.email === email)) throw new Error('An account with this email already exists.');
  const user = {
    id: 'u_' + rid(), email, name: name || email.split('@')[0], business: business || '',
    ...hashPassword(password), mcp_key: mcpKey || 'cw_' + rid(24), created_at: now(),
  };
  await store.put('users', user);
  return user;
}
export const userByKey = (key) => store.findOne('users', (u) => u.mcp_key === key);

// ---------- proposals ----------
export const STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined'];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, max = 20000) => String(v ?? '').slice(0, max);

function normSections(sections) {
  return (Array.isArray(sections) ? sections : []).slice(0, 40).map((s) => ({
    id: s.id || 's_' + rid(6), heading: str(s.heading, 200), body: str(s.body),
  }));
}
function normItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 100).map((i) => ({
    id: i.id || 'i_' + rid(6), description: str(i.description, 500),
    qty: Math.max(0, num(i.qty ?? i.quantity, 1)), unit_price: Math.max(0, num(i.unit_price ?? i.price, 0)),
    optional: Boolean(i.optional),
  }));
}

export function totals(p) {
  const subtotal = p.items.filter((i) => !i.optional).reduce((s, i) => s + i.qty * i.unit_price, 0);
  const discount = subtotal * (num(p.discount_pct) / 100);
  const tax = (subtotal - discount) * (num(p.tax_pct) / 100);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

export function money(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}

function applyFields(p, input) {
  if (input.title !== undefined) p.title = str(input.title, 200) || 'Untitled proposal';
  if (input.client_name !== undefined) p.client.name = str(input.client_name, 200);
  if (input.client_company !== undefined) p.client.company = str(input.client_company, 200);
  if (input.client_email !== undefined) p.client.email = str(input.client_email, 200);
  if (input.client) Object.assign(p.client, { name: str(input.client.name ?? p.client.name, 200), company: str(input.client.company ?? p.client.company, 200), email: str(input.client.email ?? p.client.email, 200) });
  if (input.summary !== undefined) p.summary = str(input.summary, 5000);
  if (input.sections !== undefined) p.sections = normSections(input.sections);
  if (input.items !== undefined) p.items = normItems(input.items);
  if (input.line_items !== undefined) p.items = normItems(input.line_items);
  if (input.currency !== undefined) p.currency = str(input.currency, 3).toUpperCase() || 'USD';
  if (input.tax_pct !== undefined) p.tax_pct = Math.min(100, Math.max(0, num(input.tax_pct)));
  if (input.discount_pct !== undefined) p.discount_pct = Math.min(100, Math.max(0, num(input.discount_pct)));
  if (input.valid_until !== undefined) p.valid_until = str(input.valid_until, 30);
  if (input.terms !== undefined) p.terms = str(input.terms, 10000);
  if (input.from_name !== undefined) p.from_name = str(input.from_name, 200);
  return p;
}

export async function createProposal(user, input, source = 'app') {
  const p = applyFields({
    id: 'p_' + rid(), slug: rid(12), owner: user.id, status: 'draft', source,
    title: 'Untitled proposal', client: { name: '', company: '', email: '' }, summary: '',
    sections: [], items: [], currency: 'USD', tax_pct: 0, discount_pct: 0,
    valid_until: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), terms: '',
    from_name: user.business || user.name,
    created_at: now(), updated_at: now(), sent_at: null, view_count: 0, last_viewed_at: null,
    decision: null, activity: [],
  }, input);
  p.activity.push({ at: now(), text: source === 'claude' ? 'Drafted by Claude via MCP' : 'Created in Closewise' });
  await store.put('proposals', p);
  return p;
}

export async function updateProposal(p, input, actor = 'you') {
  if (['accepted', 'declined'].includes(p.status)) throw new Error(`This proposal was already ${p.status} by the client and is locked.`);
  applyFields(p, input);
  p.updated_at = now();
  p.activity.push({ at: now(), text: `Edited by ${actor}` });
  await store.put('proposals', p);
  return p;
}

export async function publishProposal(p, actor = 'you') {
  if (['accepted', 'declined'].includes(p.status)) return p;
  if (p.status === 'draft') { p.status = 'sent'; p.sent_at = now(); p.activity.push({ at: now(), text: `Published by ${actor} — client link is live` }); }
  await store.put('proposals', p);
  return p;
}

export async function recordView(p) {
  p.view_count = (p.view_count || 0) + 1;
  p.last_viewed_at = now();
  if (p.status === 'sent') { p.status = 'viewed'; p.activity.push({ at: now(), text: 'Client opened the proposal for the first time' }); }
  await store.put('proposals', p);
}

export async function decide(p, { action, name, note, ip }) {
  if (!['sent', 'viewed'].includes(p.status)) throw new Error('This proposal can no longer be signed.');
  if (p.valid_until && p.valid_until < now().slice(0, 10)) throw new Error('This proposal has expired. Please ask for an updated one.');
  if (action === 'accept') {
    if (!String(name || '').trim()) throw new Error('Please type your full name to sign.');
    p.status = 'accepted';
    p.decision = { action, name: str(name, 200), note: str(note, 2000), at: now(), ip, total: totals(p).total };
    p.activity.push({ at: now(), text: `Accepted and signed by ${p.decision.name}` });
  } else {
    p.status = 'declined';
    p.decision = { action: 'decline', name: str(name, 200), note: str(note, 2000), at: now(), ip };
    p.activity.push({ at: now(), text: `Declined by client${note ? ': ' + str(note, 200) : ''}` });
  }
  await store.put('proposals', p);
  return p;
}

export const proposalsFor = async (user) =>
  (await store.find('proposals', (p) => p.owner === user.id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

// Sum proposal totals per currency, e.g. "$11,300 + ₹2,47,800"
export function sumMoney(list) {
  const by = {};
  for (const p of list) by[p.currency] = (by[p.currency] || 0) + totals(p).total;
  const parts = Object.entries(by).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(' + ') : money(0, 'USD');
}

// A compact view for Claude (MCP responses)
export function summarize(p, base) {
  const t = totals(p);
  return {
    id: p.id, title: p.title, status: p.status, client: p.client,
    total: money(t.total, p.currency), valid_until: p.valid_until, views: p.view_count,
    last_viewed_at: p.last_viewed_at, decision: p.decision,
    edit_url: `${base}/app/p/${p.id}`, client_link: `${base}/p/${p.slug}`,
    client_link_live: p.status !== 'draft',
  };
}

// ---------- minimal, safe markdown ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
}
export function md(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
  return blocks.map((b) => {
    const lines = b.split('\n').filter((l) => l.trim());
    if (!lines.length) return '';
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('') + '</ul>';
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return '<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
    if (/^#{1,4}\s/.test(lines[0]) && lines.length === 1) return `<h4>${inline(lines[0].replace(/^#+\s/, ''))}</h4>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}
