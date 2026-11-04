// Cloudflare Pages Function: GET/PUT /api/fitness-sync
// Stores one encrypted copy of the Field Ready dashboard. The browser encrypts it with a
// private sync key that never reaches this server; only a hash of the derived token is kept.

const MAX_BYTES = 1500000;

function json(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
  if (!env.DB) return json({ error: "Database not connected." }, 500);

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const row = await env.DB.prepare("SELECT token_hash, data FROM fitness_state WHERE id = 1").first();
  if (!token || !row || !same(await sha256(token), row.token_hash)) return json({ error: "Not authorized." }, 401);

  if (request.method === "GET") return row.data ? json(row.data, 200) : json({ error: "None saved." }, 404);

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BYTES) return json({ error: "Too large." }, 413);
  let saved;
  try { saved = JSON.parse(body); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!saved || saved.v !== 1 || typeof saved.iv !== "string" || typeof saved.ct !== "string") return json({ error: "Not an encrypted save." }, 400);
  await env.DB.prepare("UPDATE fitness_state SET data = ?1, updated_at = datetime('now') WHERE id = 1").bind(body).run();
  return json({ ok: true }, 200);
}
