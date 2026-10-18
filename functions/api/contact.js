// Cloudflare Pages Function: POST /api/contact
// Saves contact-form messages to the D1 database bound as `DB`.
// No email is sent; read messages in the Cloudflare dashboard (D1 > coachd-db > Console).

const TOPICS = ["Question", "Comment", "Coaching", "Collaboration", "Other"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export async function onRequestPost({ request, env }) {
  // Only accept submissions from this site.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "invalid request" }, 400);
  }

  // Honeypot: real people never fill in the hidden "website" field.
  if (clean(data.website, 200)) return json({ ok: true });

  const name = clean(data.name, 100);
  const email = clean(data.email, 200).toLowerCase();
  const topic = TOPICS.includes(data.topic) ? data.topic : "Other";
  const message = clean(data.message, 4000);

  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Please enter a valid email." }, 400);
  if (!message) return json({ ok: false, error: "Please write a message." }, 400);

  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 500);

  try {
    await env.DB.prepare(
      "INSERT INTO messages (name, email, topic, message) VALUES (?1, ?2, ?3, ?4)"
    ).bind(name || null, email, topic, message).run();
  } catch (err) {
    return json({ ok: false, error: "Could not save your message." }, 500);
  }

  return json({ ok: true });
}

export async function onRequest() {
  return json({ ok: false, error: "method not allowed" }, 405);
}
