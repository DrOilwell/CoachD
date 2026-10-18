// Cloudflare Pages Function: POST /api/contact
// Saves contact-form messages to the D1 database bound as `DB`.
// No email is sent; read messages in the Cloudflare dashboard (D1 > coachd-db > Console).

const TOPICS = ["Question", "Comment", "Coaching", "Collaboration", "Other"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sites allowed to send messages here (the domain, GitHub Pages, and Cloudflare Pages).
const ALLOWED_HOSTS = [
  "www.nutriactivewellness.com",
  "nutriactivewellness.com",
  "droilwell.github.io",
  "coachd.pages.dev",
];

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

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export async function onRequestPost({ request, env }) {
  // Only accept submissions from the allowed sites.
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

  const name = clean(data.name, 100);
  const email = clean(data.email, 200).toLowerCase();
  const topic = TOPICS.includes(data.topic) ? data.topic : "Other";
  const message = clean(data.message, 4000);

  if (!EMAIL_RE.test(email)) return send({ ok: false, error: "Please enter a valid email." }, 400);
  if (!message) return send({ ok: false, error: "Please write a message." }, 400);

  if (!env.DB) return send({ ok: false, error: "Database not connected." }, 500);

  try {
    await env.DB.prepare(
      "INSERT INTO messages (name, email, topic, message) VALUES (?1, ?2, ?3, ?4)"
    ).bind(name || null, email, topic, message).run();
  } catch (err) {
    return send({ ok: false, error: "Could not save your message." }, 500);
  }

  return send({ ok: true });
}

export async function onRequest() {
  return json({ ok: false, error: "method not allowed" }, 405);
}
