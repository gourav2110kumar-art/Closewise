// MCP endpoint: the plug between the customer's own Claude and Closewise.
// Claude does the thinking and writing; these tools only save, edit and publish.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { store } from './store.js';
import {
  userByKey, createProposal, updateProposal, publishProposal, proposalsFor, summarize, totals, money, sumMoney,
} from './domain.js';

const section = z.object({
  heading: z.string().describe('Section heading, e.g. "Scope of work", "Timeline", "Why us"'),
  body: z.string().describe('Section text. Light markdown: paragraphs, "- " bullets, **bold**.'),
});
const item = z.object({
  description: z.string().describe('What the client is paying for, e.g. "Brand identity: logo + 2 revisions"'),
  qty: z.number().describe('Quantity (hours, units, months...)'),
  unit_price: z.number().describe('Price per unit in the proposal currency, numbers only'),
  optional: z.boolean().optional().describe('Optional add-on, shown but not counted in total'),
});

const fields = {
  title: z.string().describe('Proposal title, e.g. "Website redesign for Acme Bakery"'),
  client_name: z.string().describe('Client contact person name'),
  client_company: z.string().optional().describe('Client company name'),
  client_email: z.string().optional().describe('Client email'),
  summary: z.string().optional().describe('2-4 sentence executive summary shown at the top'),
  sections: z.array(section).optional().describe('Body of the proposal, in order'),
  line_items: z.array(item).optional().describe('Priced line items. The app calculates totals.'),
  currency: z.string().optional().describe('ISO currency code, e.g. USD, INR, SGD, EUR. Default USD'),
  tax_pct: z.number().optional().describe('Tax percent applied after discount, e.g. 18 for GST'),
  discount_pct: z.number().optional().describe('Discount percent on subtotal'),
  valid_until: z.string().optional().describe('Expiry date YYYY-MM-DD. Default 14 days from today'),
  terms: z.string().optional().describe('Payment terms & conditions, light markdown'),
};

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

function buildServer(user, base) {
  const server = new McpServer({ name: 'closewise', version: '1.0.0' }, {
    instructions:
      'Closewise hosts client proposals. When the user asks for a proposal or quote, write the full content yourself ' +
      '(summary, sections, priced line items, terms) and call create_proposal. Then share the edit_url so the user ' +
      'can review it. Only call publish_proposal when the user says to send/publish it.',
  });

  const own = async (id) => {
    const p = await store.get('proposals', id);
    return p && p.owner === user.id ? p : null;
  };

  server.registerTool('create_proposal', {
    title: 'Create proposal',
    description: 'Save a new client proposal (as a draft) in the user\'s Closewise workspace. You write the content; Closewise stores it, calculates totals, and gives back an edit link for the user and a client link.',
    inputSchema: fields,
  }, async (input) => {
    const p = await createProposal(user, input, 'claude');
    return text({ message: 'Proposal saved as a draft in Closewise. Ask the user to review it at edit_url.', proposal: summarize(p, base) });
  });

  server.registerTool('list_proposals', {
    title: 'List proposals',
    description: 'List the user\'s proposals with status (draft, sent, viewed, accepted, declined), totals, client views and signatures.',
    inputSchema: { status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined']).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ status }) => {
    const list = (await proposalsFor(user)).filter((p) => !status || p.status === status);
    return text({ count: list.length, accepted_value: sumMoney(list.filter((p) => p.status === 'accepted')), proposals: list.map((p) => summarize(p, base)) });
  });

  server.registerTool('get_proposal', {
    title: 'Get proposal',
    description: 'Get the full content of one proposal (sections, line items, totals, activity log).',
    inputSchema: { id: z.string().describe('Proposal id, e.g. p_abc123') },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    const p = await own(id);
    if (!p) return fail('Proposal not found.');
    const t = totals(p);
    return text({ ...summarize(p, base), summary: p.summary, sections: p.sections.map(({ heading, body }) => ({ heading, body })),
      line_items: p.items.map(({ description, qty, unit_price, optional }) => ({ description, qty, unit_price, optional })),
      currency: p.currency, tax_pct: p.tax_pct, discount_pct: p.discount_pct, terms: p.terms,
      totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, money(v, p.currency)])), activity: p.activity });
  });

  server.registerTool('update_proposal', {
    title: 'Update proposal',
    description: 'Change an existing proposal. Only send the fields you want to change. sections and line_items REPLACE the whole list, so send the complete new list.',
    inputSchema: { id: z.string(), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])) },
  }, async ({ id, ...input }) => {
    const p = await own(id);
    if (!p) return fail('Proposal not found.');
    try { return text({ message: 'Proposal updated.', proposal: summarize(await updateProposal(p, input, 'Claude'), base) }); }
    catch (e) { return fail(e.message); }
  });

  server.registerTool('publish_proposal', {
    title: 'Publish proposal',
    description: 'Make the proposal live so the client can open, read and e-sign it. Returns the client link to send. Only do this when the user asks.',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const p = await own(id);
    if (!p) return fail('Proposal not found.');
    const out = await publishProposal(p, 'Claude');
    return text({ message: `Live. Send this link to ${out.client.name || 'the client'}.`, proposal: summarize(out, base) });
  });

  return server;
}

export function mountMcp(app, baseUrl) {
  const handler = async (req, res) => {
    const user = await userByKey(req.params.key);
    if (!user) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid Closewise connector key. Copy your link from Closewise → Connect Claude.' }, id: null });
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
      // Someone opened the connector link in a browser: show how to use it.
      const url = `${baseUrl(req)}/mcp/${req.params.key}`;
      return res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Closewise connector</title><link rel="stylesheet" href="/app.css"></head><body>
<div class="wrap" style="max-width:720px;padding:50px 24px">
  <a class="brand" href="/" style="margin-bottom:24px"><i></i>Closewise</a>
  <div class="card" style="margin-top:20px">
    <div class="ok">This connector is working ✓</div>
    <h2>This link is for Claude, not for a browser</h2>
    <p class="muted">It's the MCP connector that lets your Claude create and manage proposals in Closewise. Add it to Claude like this:</p>
    <ol>
      <li>In Claude, open <b>Customize → Connectors → Add → Custom connector</b>.</li>
      <li>Name: <code>Closewise</code>. URL: paste the link below.</li>
      <li>Authentication: <b>No sign-in</b>, then click <b>Add</b>.</li>
      <li>In a new chat, turn on Closewise and ask: <i>"Draft a proposal for a 5-page website for a bakery, ₹1.5 lakh plus GST, 3 weeks. Save it to Closewise."</i></li>
    </ol>
    <label>Connector URL</label>
    <div class="copybox"><input id="u" readonly value="${url}"><button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('u').value);this.textContent='Copied'">Copy</button></div>
    <p style="margin-top:20px"><a class="btn go" href="/login?demo=1">Open the Closewise app</a></p>
  </div>
</div></body></html>`);
    }
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    try {
      const server = buildServer(user, baseUrl(req));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('[mcp]', e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  };
  app.all('/mcp/:key', handler);
}
