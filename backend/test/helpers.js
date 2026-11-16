// Test helpers: a tiny fake Express app, and a Supabase-like client that talks to a real Postgres via psql.
// Only for tests. Needs the `psql` command and PG_TEST_CONN, e.g. "host=/tmp port=5544 user=pgtest dbname=kesh".
import { spawnSync } from 'node:child_process';

export function fakeApp() {
  const routes = [];
  const add = (method) => (path, ...handlers) => routes.push({ method, path, handlers });
  const app = { get: add('GET'), post: add('POST'), routes };
  app.invoke = async (method, url, body = {}, headers = {}) => {
    const route = routes.find((r) => {
      if (r.method !== method) return false;
      const re = new RegExp('^' + r.path.replace(/:[^/]+/g, '([^/]+)') + '$');
      return re.test(url);
    });
    if (!route) throw new Error(`no route ${method} ${url}`);
    const names = [...route.path.matchAll(/:([^/]+)/g)].map((m) => m[1]);
    const values = new RegExp('^' + route.path.replace(/:[^/]+/g, '([^/]+)') + '$').exec(url).slice(1);
    const req = {
      params: Object.fromEntries(names.map((n, i) => [n, values[i]])),
      body, headers, rawBody: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    };
    const out = { status: 200, body: undefined };
    const res = {
      status(c) { out.status = c; return res; },
      json(b) { out.body = b; return res; },
    };
    for (const h of route.handlers) {
      let nexted = false;
      await h(req, res, (err) => { nexted = true; if (err) throw err; });
      if (!nexted) break;
    }
    return out;
  };
  return app;
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

export function psql(sql) {
  const r = spawnSync('psql', [process.env.PG_TEST_CONN, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) {
    const m = /ERROR:\s+(.*)/.exec(r.stderr);
    const message = m ? m[1].trim() : r.stderr;
    const err = new Error(message);
    err.code = message === 'Not allowed.' ? '42501' : /permission denied/.test(message) ? '42501' : 'P0001';
    throw err;
  }
  return r.stdout.trim();
}

export function pgDb() {
  return {
    async rpc(name, args = {}) {
      const a = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
      try {
        const out = psql(`select to_jsonb(public.${name}(${a}))`);
        return { data: out === '' ? null : JSON.parse(out), error: null };
      } catch (e) {
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
  };
}
