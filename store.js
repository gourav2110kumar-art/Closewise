// Tiny document store. Uses Postgres when DATABASE_URL is set (production),
// otherwise a local JSON file (development). No AI anywhere in here.
import fs from 'node:fs';
import path from 'node:path';

let backend;

function fileBackend() {
  const file = process.env.DATA_FILE || path.join(process.cwd(), 'data.json');
  let db = { users: {}, proposals: {} };
  if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const save = () => fs.writeFileSync(file, JSON.stringify(db, null, 2));
  return {
    async init() {},
    async get(coll, id) { return db[coll]?.[id] ? structuredClone(db[coll][id]) : null; },
    async put(coll, doc) { (db[coll] ||= {})[doc.id] = structuredClone(doc); save(); return doc; },
    async del(coll, id) { delete db[coll]?.[id]; save(); },
    async all(coll) { return Object.values(db[coll] || {}).map((d) => structuredClone(d)); },
  };
}

async function pgBackend() {
  const { default: pg } = await import('pg');
  const mk = (ssl) => new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: ssl ? { rejectUnauthorized: false } : false });
  let pool = mk(process.env.PGSSL !== 'disable');
  return {
    async init() {
      try { await pool.query('SELECT 1'); }
      catch (e) { // internal hosts often don't speak SSL: retry without it
        if (!/ssl/i.test(e.message)) throw e;
        await pool.end().catch(() => {}); pool = mk(false); await pool.query('SELECT 1');
      }
      await pool.query(`CREATE TABLE IF NOT EXISTS docs (
        coll TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (coll, id))`);
    },
    async get(coll, id) {
      const r = await pool.query('SELECT data FROM docs WHERE coll=$1 AND id=$2', [coll, id]);
      return r.rows[0]?.data || null;
    },
    async put(coll, doc) {
      await pool.query(
        `INSERT INTO docs (coll, id, data) VALUES ($1,$2,$3)
         ON CONFLICT (coll, id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
        [coll, doc.id, doc]);
      return doc;
    },
    async del(coll, id) { await pool.query('DELETE FROM docs WHERE coll=$1 AND id=$2', [coll, id]); },
    async all(coll) {
      const r = await pool.query('SELECT data FROM docs WHERE coll=$1', [coll]);
      return r.rows.map((x) => x.data);
    },
  };
}

export async function initStore() {
  backend = process.env.DATABASE_URL ? await pgBackend() : fileBackend();
  await backend.init();
  console.log(`[store] using ${process.env.DATABASE_URL ? 'Postgres' : 'local JSON file'}`);
}

export const store = {
  get: (c, id) => backend.get(c, id),
  put: (c, d) => backend.put(c, d),
  del: (c, id) => backend.del(c, id),
  all: (c) => backend.all(c),
  async find(c, fn) { return (await backend.all(c)).filter(fn); },
  async findOne(c, fn) { return (await backend.all(c)).find(fn) || null; },
};
