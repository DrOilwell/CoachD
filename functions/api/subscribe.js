// Cloudflare Pages Function: POST /api/subscribe
// Free membership: name + email. Returns a member key the browser keeps,
// so members' comments go live right away. Only a hash of the key is stored.

const ALLOWED_HOSTS = [
  "www.nutriactivewellness.com",
  "nutriactivewellness.com",
  "droilwell.github.io",
  "coachd.pages.dev",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (host === new URL(request.url).host) return origin;
  if (ALLOWED_HOSTS.includes(host) || host.endsWith(".coachd.pages.dev")) return origin;
  return false;
}

function json(body, status = 200, origin = null) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestOptions({ request }) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const origin = allowedOrigin(request);
  if (origin === false) return json({ ok: false, error: "forbidden" }, 403);
  const send = (body, status = 200) => json(body, status, origin);

  let data;
  try {
    data = await request.json();
  } catch {
    return send({ ok: false, error: "invalid request" }, 400);
  }

  // Honeypot: real people never fill in the hidden "website" field.
  if (clean(data.website, 200)) return send({ ok: false, error: "Please try again." }, 400);

  const name = clean(data.name, 60);
  const email = clean(data.email, 200).toLowerCase();
  const updates = data.updates ? 1 : 0;

  if (!name) return send({ ok: false, error: "Please add your name." }, 400);
  if (!EMAIL_RE.test(email)) return send({ ok: false, error: "Please enter a valid email." }, 400);
  if (!env.DB) return send({ ok: false, error: "Database not connected." }, 500);

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);

  try {
    // New email: create the member. Returning email: refresh their key on this device.
    await env.DB.prepare(
      `INSERT INTO members (name, email, token_hash, updates, last_seen)
       VALUES (?1, ?2, ?3, ?4, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         token_hash = excluded.token_hash,
         updates = MAX(members.updates, excluded.updates),
         last_seen = datetime('now')
       WHERE members.status = 'active'`
    ).bind(name, email, tokenHash, updates).run();

    const row = await env.DB.prepare(
      "SELECT id, status FROM members WHERE email = ?1"
    ).bind(email).first();
    if (!row || row.status !== "active") {
      return send({ ok: false, error: "This membership isn't active. Use the Contact page if you think that's a mistake." }, 403);
    }
    // One key per device, so joining on a phone doesn't sign out a laptop.
    await env.DB.prepare(
      "INSERT INTO member_keys (member_id, token_hash) VALUES (?1, ?2)"
    ).bind(row.id, tokenHash).run();
  } catch (err) {
    return send({ ok: false, error: "Could not save your membership." }, 500);
  }

  return send({ ok: true, name, token });
}

export async function onRequest() {
  return json({ ok: false, error: "method not allowed" }, 405);
}
