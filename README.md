# Closewise

**Your Claude writes the proposal. Closewise gets it signed.**

Closewise is a proposal tool for freelancers, studios and agencies. You ask your own Claude to draft a client proposal. Claude sends it into Closewise through MCP. You edit it, publish one link, see when the client opens it, and the client accepts it with an e-signature.

**There is no AI inside Closewise.** It has no OpenAI, Anthropic or other AI keys and no AI SDKs. Claude does the thinking and writing on the customer's own Claude plan. Closewise handles saving, editing, hosting, view tracking and signatures.

## What's inside

| Part | File |
|---|---|
| MCP server (5 tools: create, list, get, update, publish) | `src/mcp.js` |
| Web app: dashboard, editor, connect page | `src/server.js`, `src/views.js`, `public/editor.js` |
| Client page: view, accept & sign, decline, PDF | `/p/:slug` in `src/server.js` |
| Storage: Postgres in production, JSON file locally | `src/store.js` |
| Demo account + example proposals | `src/seed.js` |

## Run locally

```bash
npm install
npm start            # http://localhost:3000
```
Demo login: `demo@closewise.app` / `demo1234`

## Deploy on Render (free, about 10 minutes)

1. Create a new GitHub repository and upload all of these files (everything except `node_modules`).
2. On render.com, go to **New → Blueprint** and pick the repository. Render reads `render.yaml` and creates the web service and a free Postgres database.
3. Click **Apply** and wait for the deploy to finish. Your app will be at `https://closewise-xxxx.onrender.com`.
4. Open it and log in with the demo account.

> On Render's free plan, the app goes to sleep after 15 minutes without traffic, and the first request then takes about 50 seconds. Open the app in a browser before you use it from Claude or record a demo.

## Connect to Claude

Your connector URL is `https://<your-app>.onrender.com/mcp/<your-key>`. You can find it in the app under **Connect Claude**.
The demo account's URL is `https://<your-app>.onrender.com/mcp/cw_demo_volopay2026`.

**Claude (web or desktop):** Settings → Connectors → Add custom connector. Name it **Closewise**, paste the URL and click **Add**. In a chat, make sure Closewise is switched on in the tools menu.

**Claude Code:** `claude mcp add --transport http closewise <URL>`

Try asking:
> Draft a proposal for Priya Sharma at Bloom Bakery: a new 6-page Shopify site plus a brand refresh, budget ₹2.4 lakh plus 18% GST, 4 weeks, 50% upfront. Save it to Closewise.

## MCP tools

| Tool | What it does |
|---|---|
| `create_proposal` | Saves a draft with summary, sections, priced line items, currency, tax, discount and terms. Returns the edit link. |
| `list_proposals` | Lists proposals with status (draft, sent, viewed, accepted, declined), totals, views and signatures. |
| `get_proposal` | Returns the full content and activity log of one proposal. |
| `update_proposal` | Changes some fields of a proposal. Proposals that have been signed are locked. |
| `publish_proposal` | Makes the client link live. |
