// Creates the demo account (and two example proposals) on first boot.
import { store } from './store.js';
import { createUser, createProposal, publishProposal, recordView, decide } from './domain.js';

export async function seedDemo() {
  const email = 'demo@closewise.app';
  if (await store.findOne('users', (u) => u.email === email)) return;
  const user = await createUser({
    email, password: process.env.DEMO_PASSWORD || 'demo1234', name: 'Demo Founder', business: 'Northwind Studio',
    mcpKey: process.env.DEMO_MCP_KEY || 'cw_demo_' + Math.random().toString(36).slice(2, 12),
  });

  const a = await createProposal(user, {
    title: 'Mobile app MVP for FitTrack',
    client_name: 'Arjun Mehta', client_company: 'FitTrack Labs', client_email: 'arjun@fittrack.example',
    summary: 'A 6-week build of a cross-platform fitness tracking MVP, ready for your seed-round demo day.',
    sections: [
      { heading: 'Scope of work', body: '- React Native app for iOS & Android\n- Workout logging, streaks and weekly summary\n- Admin panel for content\n- App Store and Play Store submission' },
      { heading: 'Timeline', body: '**Week 1–2:** design & prototype\n**Week 3–5:** build & test\n**Week 6:** launch support' },
    ],
    line_items: [
      { description: 'UX/UI design (12 screens)', qty: 1, unit_price: 3200 },
      { description: 'App development', qty: 160, unit_price: 45 },
      { description: 'Launch support (2 weeks)', qty: 1, unit_price: 900 },
    ],
    currency: 'USD', terms: '50% to start, 50% on launch. Invoices due within 7 days.',
  }, 'claude');
  await publishProposal(a); await recordView(a); await recordView(a);
  await decide(a, { action: 'accept', name: 'Arjun Mehta', note: 'Excited to start Monday!', ip: '127.0.0.1' });

  const b = await createProposal(user, {
    title: 'Quarterly SEO retainer for Green Leaf Café',
    client_name: 'Sara Lim', client_company: 'Green Leaf Café',
    summary: 'Three months of local SEO to bring more weekday walk-ins from Google Maps and search.',
    sections: [{ heading: 'What we will do', body: '- Google Business Profile optimisation\n- 6 blog posts targeting local searches\n- Monthly ranking report' }],
    line_items: [{ description: 'SEO retainer (monthly)', qty: 3, unit_price: 850 }, { description: 'Professional photo shoot', qty: 1, unit_price: 400, optional: true }],
    currency: 'SGD', tax_pct: 9,
  }, 'claude');
  await publishProposal(b); await recordView(b);
  console.log(`[seed] demo account ready: ${email} — MCP key ${user.mcp_key}`);
}
