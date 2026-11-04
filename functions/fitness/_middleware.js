// Passcode gate for /fitness/. The passcode is checked on the server against a salted hash in D1,
// with a lockout after repeated failures. It is never stored in this repository.

import { PAGE, SW } from "./_app.js";

const OPEN = new Set(["/fitness/manifest.webmanifest", "/fitness/icon.png"]);
const COOKIE = "fr_gate";
const DAYS = 30;
const enc = new TextEncoder();
const hex = u => [...new Uint8Array(u)].map(b => b.toString(16).padStart(2, "0")).join("");

async function pbkdf2(code, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
async function validCookie(request, secret) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp(COOKIE + "=(\\d+)\\.([0-9a-f]+)"));
  if (!m || +m[1] < Date.now()) return false;
  return same(await sign(m[1], secret), m[2]);
}
const json = (o, status, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

const GATE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>Field Ready</title><style>
:root{--bg:#f6f0e6;--surface:#fffdf9;--ink:#10282f;--muted:#5d7076;--line:#ebe2d3;--accent:#0d7c86;--accent-ink:#fff;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#0b1a20;--surface:#12262d;--ink:#e8f1f2;--muted:#9db1b5;--line:#213c45;--accent:#4cc6c9;--accent-ink:#05252a;--bad:#f08a80;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.5 'Avenir Next','Avenir','Segoe UI',Roboto,Helvetica,Arial,sans-serif}
form{width:min(100%,340px);background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:1.5rem;color:var(--accent)}p{margin:0;color:var(--muted);font-size:.9rem}
input{font:inherit;font-size:1.5rem;letter-spacing:.3em;text-align:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:inherit;width:100%}
button{font:inherit;font-weight:700;padding:11px;border:0;border-radius:12px;background:var(--accent);color:var(--accent-ink);cursor:pointer}#m{color:var(--bad);font-weight:700;min-height:1.4em}
</style></head><body><form id="f"><h1>Field Ready</h1><p>Enter your 6-digit passcode.</p><input id="c" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" autofocus aria-label="Passcode"><button type="submit">Unlock</button><p id="m" role="status"></p></form>
<script>
try{if(sessionStorage.getItem('field-ready.open')==='1'){sessionStorage.removeItem('field-ready.open');document.getElementById('m').textContent='Your passcode was accepted, but this browser did not keep the sign-in. Open the link in Safari or Chrome with cookies allowed, not inside an in-app browser.'}}catch(x){}
const E=new TextEncoder(),H=u=>[...new Uint8Array(u)].map(b=>b.toString(16).padStart(2,'0')).join('');
async function P(c,s){const k=await crypto.subtle.importKey('raw',E.encode(c),'PBKDF2',false,['deriveBits']);return H(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:E.encode(s),iterations:100000},k,256))}
document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const c=document.getElementById('c').value.replace(/\\D/g,''),m=document.getElementById('m');m.textContent='';
 try{const r=await fetch('/fitness/unlock',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c})});
  if(r.ok){const s=H(crypto.getRandomValues(new Uint8Array(16)));try{localStorage.setItem('field-ready.lock',JSON.stringify({s,h:await P(c,s)}));sessionStorage.setItem('field-ready.open','1')}catch(x){}location.replace('/fitness/');return}
  m.textContent=r.status===429?'Too many tries. Try again in 15 minutes.':r.status===401?'That passcode is not right.':'The site could not check the passcode (error '+r.status+'). Try again shortly.'}catch(x){m.textContent='Connect to the internet to unlock on this device for the first time.'}
 document.getElementById('c').value='';document.getElementById('c').focus()});
</script></body></html>`;

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (OPEN.has(url.pathname)) return next();
  if (url.pathname === "/fitness/sw.js") return new Response(SW, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
  const row = env.DB ? await env.DB.prepare("SELECT salt, hash, secret, fails, locked_until FROM fitness_gate WHERE id = 1").first() : null;
  if (!row) return new Response("This page is locked.", { status: 503, headers: { "Cache-Control": "no-store" } });

  if (url.pathname === "/fitness/unlock") {
    const origin = request.headers.get("Origin");
    if (request.method !== "POST") return json({ ok: false }, 405);
    if (origin && new URL(origin).host !== url.host) return json({ ok: false }, 403);
    const now = Date.now();
    if (row.locked_until > now) return json({ ok: false }, 429);
    let code = "";
    try { code = String((await request.json()).code || ""); } catch {}
    if (/^\d{6}$/.test(code) && same(await pbkdf2(code, row.salt), row.hash)) {
      await env.DB.prepare("UPDATE fitness_gate SET fails = 0, locked_until = 0 WHERE id = 1").run();
      const exp = String(now + DAYS * 864e5);
      const cookie = `${COOKIE}=${exp}.${await sign(exp, row.secret)}; Path=/fitness; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
      return json({ ok: true }, 200, { "Set-Cookie": cookie });
    }
    const fails = row.fails + 1, lock = fails >= 5;
    await env.DB.prepare("UPDATE fitness_gate SET fails = ?1, locked_until = ?2 WHERE id = 1").bind(lock ? 0 : fails, lock ? now + 9e5 : 0).run();
    return json({ ok: false }, lock ? 429 : 401);
  }

  if (request.method !== "GET" && request.method !== "HEAD") return json({ ok: false }, 405);
  if (await validCookie(request, row.secret)) {
    if (url.pathname === "/fitness" || url.pathname === "/fitness/index.html") return Response.redirect(url.origin + "/fitness/", 302);
    if (url.pathname === "/fitness/") return new Response(request.method === "HEAD" ? null : PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY" } });
    return next();
  }
  return new Response(GATE, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY" } });
}
