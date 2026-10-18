// Cloudflare Pages Function: /api/comments
// GET  /api/comments?post=<postId>  -> approved comments for a blog post
// POST /api/comments                -> new comment, shown right away (held only if it contains a link)
// Comments live in the D1 database bound as `DB` (table: comments).

const ALLOWED_HOSTS = [
  "www.nutriactivewellness.com",
  "nutriactivewellness.com",
  "droilwell.github.io",
  "coachd.pages.dev",
];
const POST_ID_RE = /^[a-z0-9-]{1,60}$/;

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (host === new URL(request.url).host) return origin;
  if (ALLOWED_HOSTS.includes(host) || host.endsWith(".coachd.pages.dev")) return origin;
  return false;
}

function json(body, status = 200, origin = null, cache = "no-store") {
  const headers = { "Content-Type": "application/json", "Cache-Control": cache };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
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
  const post = new URL(request.url).searchParams.get("post") || "";
  if (!POST_ID_RE.test(post)) return json({ ok: false, error: "unknown post" }, 400, origin);
  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 500, origin);

  const { results } = await env.DB.prepare(
    "SELECT name, comment, reply, created_at FROM comments WHERE post_id = ?1 AND approved = 1 ORDER BY created_at ASC LIMIT 200"
  ).bind(post).all();

  return json({ ok: true, comments: results || [] }, 200, origin, "no-store");
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

  const post = clean(data.post, 60);
  const name = clean(data.name, 60);
  const comment = clean(data.comment, 1500);

  if (!POST_ID_RE.test(post)) return send({ ok: false, error: "unknown post" }, 400);
  if (!name) return send({ ok: false, error: "Please add your name." }, 400);
  if (!comment) return send({ ok: false, error: "Please write a comment." }, 400);
  if (!env.DB) return send({ ok: false, error: "Database not connected." }, 500);

  // Comments go live right away. Ones containing links (the usual sign of spam) wait for review.
  const hasLink = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|info|biz|link|click)\b)/i.test(name + " " + comment);
  const approved = hasLink ? 0 : 1;

  try {
    await env.DB.prepare(
      "INSERT INTO comments (post_id, name, comment, approved) VALUES (?1, ?2, ?3, ?4)"
    ).bind(post, name, comment, approved).run();
  } catch (err) {
    return send({ ok: false, error: "Could not save your comment." }, 500);
  }

  return send({ ok: true, pending: !approved });
}

export async function onRequest() {
  return json({ ok: false, error: "method not allowed" }, 405);
}
