// Cloudflare Pages Function: /api/testimonials
// GET  /api/testimonials?page=<page>  -> published stories for a page
// POST /api/testimonials              -> new story (name + email required); shown right away.
// Emails are stored privately in D1 (table: testimonials) and never returned to the site.

const ALLOWED_HOSTS = [
  "www.nutriactivewellness.com",
  "nutriactivewellness.com",
  "droilwell.github.io",
  "coachd.pages.dev",
];
const PAGES = ["nutrition", "day", "burners", "science"];
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const origin = allowedOrigin(request);
  if (origin === false) return json({ ok: false, error: "forbidden" }, 403);
  const page = new URL(request.url).searchParams.get("page") || "";
  if (!PAGES.includes(page)) return json({ ok: false, error: "unknown page" }, 400, origin);
  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 500, origin);

  const { results } = await env.DB.prepare(
    "SELECT name, story, member, created_at FROM testimonials WHERE page = ?1 AND approved = 1 ORDER BY created_at DESC LIMIT 100"
  ).bind(page).all();
  return json({ ok: true, stories: results || [] }, 200, origin);
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
  if (clean(data.website, 200)) return send({ ok: true });

  const page = clean(data.page, 20);
  let name = clean(data.name, 60);
  let email = clean(data.email, 200).toLowerCase();
  const story = clean(data.story, 2000);
  const memberKey = clean(data.memberKey, 128);

  if (!PAGES.includes(page)) return send({ ok: false, error: "unknown page" }, 400);
  if (!story) return send({ ok: false, error: "Please write your story." }, 400);
  if (!env.DB) return send({ ok: false, error: "Database not connected." }, 500);

  // Members are recognized by their key; their saved name and email are used.
  let isMember = false;
  if (/^[a-f0-9]{64}$/.test(memberKey)) {
    const m = await env.DB.prepare(
      `SELECT m.name, m.email FROM member_keys k JOIN members m ON m.id = k.member_id
       WHERE k.token_hash = ?1 AND m.status = 'active'`
    ).bind(await sha256(memberKey)).first();
    if (m) { isMember = true; name = m.name; email = m.email; }
  }

  if (!name) return send({ ok: false, error: "Please add your name." }, 400);
  if (!EMAIL_RE.test(email)) return send({ ok: false, error: "Please enter a valid email." }, 400);

  // Stories go live right away; ones containing web links (the usual sign of spam) wait for review.
  const hasLink = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|info|biz|link|click)\b)/i.test(name + " " + story);
  const approved = hasLink ? 0 : 1;

  try {
    await env.DB.prepare(
      "INSERT INTO testimonials (page, name, email, story, approved, member) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    ).bind(page, name, email, story, approved, isMember ? 1 : 0).run();
  } catch (err) {
    return send({ ok: false, error: "Could not save your story." }, 500);
  }

  return send({ ok: true, pending: !approved, member: isMember });
}

export async function onRequest() {
  return json({ ok: false, error: "method not allowed" }, 405);
}
