// Closewise — proposals drafted by the customer's own Claude, hosted and signed here.
// There is NO AI in this app and no AI API keys anywhere.
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initStore, store } from './store.js';
import { mountMcp } from './mcp.js';
import {
  createUser, checkPassword, createProposal, updateProposal, publishProposal, recordView, decide, proposalsFor,
} from './domain.js';
import { landing, authPage, dashboard, connectPage, editor, clientView, notFound } from './views.js';
import { seedDemo } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(SECRET));
// static assets (all files live in one folder)
for (const f of ['app.css', 'editor.js']) app.get('/' + f, (_req, res) => res.sendFile(path.join(__dirname, f), { maxAge: 3600e3 }));

const baseUrl = (req) => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// ---------- sessions (signed cookie) ----------
async function loadUser(req, _res, next) {
  const id = req.signedCookies?.sid;
  req.user = id ? await store.get('users', id) : null;
  next();
}
const login = (res, user) => res.cookie('sid', user.id, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, secure: process.env.NODE_ENV === 'production' });
const requireUser = (req, res, next) => (req.user ? next() : req.path.startsWith('/api') ? res.status(401).json({ error: 'Please log in again.' }) : res.redirect('/login'));
app.use(loadUser);

async function ownProposal(req, res, next) {
  const p = await store.get('proposals', req.params.id);
  if (!p || p.owner !== req.user.id) return res.status(404).send(notFound());
  req.proposal = p; next();
}

// ---------- MCP (the Claude connector) ----------
mountMcp(app, baseUrl);

// ---------- public pages ----------
app.get('/', (req, res) => res.send(landing(req.user)));
app.get('/health', (_req, res) => res.json({ ok: true, ai_inside: false }));
app.get('/login', (req, res) => (req.user ? res.redirect('/app') : res.send(authPage({ mode: 'login', demo: req.query.demo }))));
app.get('/signup', (req, res) => (req.user ? res.redirect('/app') : res.send(authPage({ mode: 'signup' }))));
app.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await store.findOne('users', (u) => u.email === email);
  if (!user || !checkPassword(user, String(req.body.password || ''))) return res.status(401).send(authPage({ mode: 'login', error: 'Wrong email or password.', values: req.body }));
  login(res, user); res.redirect('/app');
});
app.post('/signup', async (req, res) => {
  try { const user = await createUser(req.body); login(res, user); res.redirect('/app/connect'); }
  catch (e) { res.status(400).send(authPage({ mode: 'signup', error: e.message, values: req.body })); }
});
app.post('/logout', (_req, res) => { res.clearCookie('sid'); res.redirect('/'); });

// Client-facing proposal (no login for the client)
app.get('/p/:slug', async (req, res) => {
  const p = await store.findOne('proposals', (x) => x.slug === req.params.slug);
  if (!p || p.status === 'draft') return res.status(404).send(notFound());
  const isOwner = req.user && req.user.id === p.owner;
  if (!isOwner) await recordView(p);
  res.send(clientView(p, { owner: isOwner }));
});
app.post('/p/:slug/decide', async (req, res) => {
  const p = await store.findOne('proposals', (x) => x.slug === req.params.slug);
  if (!p || p.status === 'draft') return res.status(404).send(notFound());
  try {
    if (req.body.action === 'accept' && !req.body.agree) throw new Error('Please tick the box to agree to the terms.');
    await decide(p, { action: req.body.action === 'decline' ? 'decline' : 'accept', name: req.body.name, note: req.body.note, ip: req.ip });
    res.redirect(`/p/${p.slug}`);
  } catch (e) { res.status(400).send(clientView(p, { error: e.message })); }
});

// ---------- the app ----------
app.get('/app', requireUser, async (req, res) => res.send(dashboard(req.user, await proposalsFor(req.user))));
app.get('/app/connect', requireUser, (req, res) => res.send(connectPage(req.user, `${baseUrl(req)}/mcp/${req.user.mcp_key}`)));
app.post('/app/new', requireUser, async (req, res) => {
  const p = await createProposal(req.user, { title: 'Untitled proposal', sections: [{ heading: 'Scope of work', body: '' }], line_items: [{ description: '', qty: 1, unit_price: 0 }] });
  res.redirect(`/app/p/${p.id}`);
});
app.get('/app/p/:id', requireUser, ownProposal, (req, res) => res.send(editor(req.user, req.proposal, `${baseUrl(req)}/p/${req.proposal.slug}`)));
app.get('/app/preview/:id', requireUser, ownProposal, (req, res) => res.send(clientView(req.proposal, { preview: true })));
app.post('/app/p/:id/publish', requireUser, ownProposal, async (req, res) => { await publishProposal(req.proposal); res.redirect(`/app/p/${req.params.id}`); });
app.post('/app/p/:id/delete', requireUser, ownProposal, async (req, res) => {
  if (['accepted', 'declined'].includes(req.proposal.status)) return res.redirect(`/app/p/${req.params.id}`);
  await store.del('proposals', req.params.id); res.redirect('/app');
});
app.put('/api/proposals/:id', requireUser, ownProposal, async (req, res) => {
  try {
    const { title, client, summary, sections, items, currency, tax_pct, discount_pct, valid_until, terms, from_name } = req.body;
    const p = await updateProposal(req.proposal, { title, client, summary, sections, items, currency, tax_pct, discount_pct, valid_until, terms, from_name }, req.user.name);
    res.json({ ok: true, updated_at: p.updated_at });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.use((_req, res) => res.status(404).send(notFound()));

await initStore();
await seedDemo();
app.listen(PORT, () => console.log(`Closewise running on http://localhost:${PORT}  (no AI inside)`));
