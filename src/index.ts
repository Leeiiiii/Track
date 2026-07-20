export interface Env {
  DB: D1Database;
  DASHBOARD_PASSWORD: string;
  SESSION_SIGNING_KEY: string;
  ALLOWED_ORIGINS?: string;
}

type Payload = { site?: unknown; visitorId?: unknown; url?: unknown; referrer?: unknown; title?: unknown; language?: unknown; timezone?: unknown; screen?: unknown; duration?: unknown; event?: unknown };
const encoder = new TextEncoder();

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}
function json(data: unknown, init: ResponseInit = {}): Response {
  return response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json; charset=utf-8", ...init.headers } });
}
function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.ALLOWED_ORIGINS || "*").split(",").map((v) => v.trim());
  const permitted = configured.includes("*") || configured.includes(origin);
  return new Headers({ "Access-Control-Allow-Origin": permitted ? (configured.includes("*") ? "*" : origin) : "null", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" });
}
function text(value: unknown, max = 512): string | null { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function siteId(value: unknown): string | null { const v = text(value, 64); return v && /^[a-zA-Z0-9_-]+$/.test(v) ? v : null; }
function visitorId(value: unknown): string | null { const v = text(value, 64); return v && /^[a-f0-9-]{16,64}$/i.test(v) ? v : null; }
function safeUrl(value: unknown): URL | null { try { const u = new URL(String(value)); return u.protocol === "https:" || u.protocol === "http:" ? u : null; } catch { return null; } }
function safeEqual(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false;
  const a = encoder.encode(supplied), b = encoder.encode(expected);
  let mismatch = a.byteLength ^ b.byteLength;
  const length = Math.max(a.byteLength, b.byteLength);
  for (let i = 0; i < length; i++) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}
function base64Url(bytes: Uint8Array): string { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function signature(value: string, key: string): Promise<string> { const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)))); }
function cookie(request: Request, name: string): string | null { const part = request.headers.get("Cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`)); return part ? decodeURIComponent(part.slice(name.length + 1)) : null; }
async function authorized(request: Request, env: Env): Promise<boolean> { const token = cookie(request, "edge_track_session"); if (!token) return false; const [expires, signed] = token.split("."); if (!expires || !signed || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false; return safeEqual(signed, await signature(`admin:${expires}`, env.SESSION_SIGNING_KEY)); }
function trackerScript(): string {
  return `(()=>{const s=document.currentScript,d=s?.dataset||{},site=d.site;if(!site)return console.warn('[EdgeTrack] data-site is required');const endpoint=new URL('/collect',s.src).href,key='__edge_track_visitor_'+site;let visitorId;try{visitorId=localStorage.getItem(key);if(!visitorId){visitorId=crypto.randomUUID();localStorage.setItem(key,visitorId)}}catch{visitorId=crypto.randomUUID()}let sent=false;const send=(event,duration=0)=>{if(sent&&event==='leave')return;sent=event==='leave'||sent;const data={site,visitorId,url:location.href,referrer:document.referrer,title:document.title,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,screen:screen.width+'x'+screen.height,duration,event};const body=JSON.stringify(data);if(navigator.sendBeacon){navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));}else fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{});};const start=Date.now();send('pageview');addEventListener('pagehide',()=>send('leave',Date.now()-start),{once:true});})();`;
}

const dashboard = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EdgeTrack 数据看板</title><style>body{margin:0;background:#0b1020;color:#edf2ff;font:14px system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:42px 20px}h1{font-size:28px;margin:0 0 6px}.muted{color:#91a0c8}.bar{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0}input,button{border:1px solid #334269;border-radius:9px;padding:10px 12px;background:#131c35;color:inherit}button{background:#6c63ff;border:0;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.card{background:#131c35;border:1px solid #243155;border-radius:14px;padding:18px}.metric{font-size:30px;font-weight:700;margin-top:8px}table{width:100%;border-collapse:collapse;margin-top:15px}td,th{text-align:left;padding:10px;border-bottom:1px solid #273453}@media(max-width:700px){.grid{grid-template-columns:repeat(2,1fr)}}</style><main><h1>EdgeTrack</h1><p class="muted">所有接入站点的访问汇总 · 后台可查看原始 IP 与设备信息</p><div class="bar"><input id="password" type="password" placeholder="后台密码"><button id="login">登录并加载所有数据</button></div><section class="grid"><div class="card">总访问量<div class="metric" id="visits">–</div></div><div class="card">独立访客<div class="metric" id="visitors">–</div></div><div class="card">站点数量<div class="metric" id="sites">–</div></div><div class="card">平均停留<div class="metric" id="duration">–</div></div></section><section class="card" style="margin-top:14px"><h2>站点 / 来源 / 页面 / 国家 / IP / 设备 / 浏览器 / 系统</h2><table><thead><tr><th>维度</th><th>名称</th><th>访问</th></tr></thead><tbody id="rows"></tbody></table></section></main><script>const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('zh-CN').format(n);async function load(){const r=await fetch('/api/summary');if(!r.ok)return alert('请先登录');const d=await r.json();$('visits').textContent=fmt(d.totals.visits);$('visitors').textContent=fmt(d.totals.visitors);$('sites').textContent=fmt(d.totals.sites);$('duration').textContent=Math.round(d.totals.avgDuration/1000)+' 秒';$('rows').innerHTML=d.groups.flatMap(g=>g.rows.map(x=>'<tr><td>'+g.label+'</td><td>'+esc(x.name)+'</td><td>'+fmt(x.count)+'</td></tr>')).join('')||'<tr><td colspan="3">暂无数据</td></tr>'}async function login(){const password=$('password').value;if(!password)return alert('请输入后台密码');const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});if(!r.ok)return alert('密码错误');$('password').value='';load()}function esc(s){const e=document.createElement('span');e.textContent=s;return e.innerHTML}$('login').onclick=login;</script></html>`;

async function collect(request: Request, env: Env): Promise<Response> {
  const headers = cors(request, env);
  if (request.method === "OPTIONS") return response(null, { status: 204, headers });
  if (request.method !== "POST") return response("Method not allowed", { status: 405, headers });
  let data: Payload; try { data = await request.json<Payload>(); } catch { return json({ error: "Invalid JSON" }, { status: 400, headers }); }
  const site = siteId(data.site), visitor = visitorId(data.visitorId), page = safeUrl(data.url);
  if (!site || !visitor || !page) return json({ error: "site, visitorId and url are required" }, { status: 400, headers });
  const ref = safeUrl(data.referrer); const cf = request.cf;
  const ip = request.headers.get("CF-Connecting-IP")?.slice(0, 64) || null;
  const agent = new UAParser(request.headers.get("User-Agent") || "");
  const browser = agent.getBrowser(), os = agent.getOS(), device = agent.getDevice();
  const duration = typeof data.duration === "number" ? Math.max(0, Math.min(Math.round(data.duration), 86_400_000)) : 0;
  const event = data.event === "leave" ? "leave" : "pageview";
  const visitId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO visits (id,site_id,path,host,referrer_host,referrer_url,title,user_agent,browser_name,browser_version,os_name,os_version,device_vendor,device_model,device_type,ip_address,country,city,language,timezone,screen,duration_ms,event_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(visitId, site, page.pathname.slice(0, 1024), page.hostname, ref?.hostname || null, ref?.href.slice(0, 2048) || null, text(data.title, 512), request.headers.get("User-Agent")?.slice(0, 1024) || null, browser.name || null, browser.version || null, os.name || null, os.version || null, device.vendor || null, device.model || null, device.type || null, ip, typeof cf?.country === "string" ? cf.country : null, typeof cf?.city === "string" ? cf.city : null, text(data.language, 64), text(data.timezone, 128), text(data.screen, 32), duration, event, new Date().toISOString()),
    env.DB.prepare("INSERT INTO visit_visitors (visit_id, visitor_id) VALUES (?,?)").bind(visitId, visitor)
  ]);
  return json({ ok: true }, { status: 202, headers });
}

async function login(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return response("Method not allowed", { status: 405 });
  if (Number(request.headers.get("Content-Length") || 0) > 4096) return json({ error: "Payload too large" }, { status: 413 });
  let password: unknown; try { password = (await request.json<{ password?: unknown }>()).password; } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!safeEqual(typeof password === "string" ? password : "", env.DASHBOARD_PASSWORD)) return json({ error: "Invalid credentials" }, { status: 401 });
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  const token = `${expires}.${await signature(`admin:${expires}`, env.SESSION_SIGNING_KEY)}`;
  return json({ ok: true }, { headers: { "Set-Cookie": `edge_track_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` } });
}

async function summary(request: Request, env: Env): Promise<Response> {
  if (!(await authorized(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
  const totals = await env.DB.prepare("SELECT COUNT(*) visits, COUNT(DISTINCT vv.visitor_id) visitors, COUNT(DISTINCT v.site_id) sites, COALESCE(AVG(NULLIF(v.duration_ms,0)),0) avgDuration FROM visits v LEFT JOIN visit_visitors vv ON vv.visit_id=v.id").first<Record<string, number>>();
  const group = async (label: string, expression: "site_id" | "referrer_host" | "path" | "country" | "ip_address" | "browser_name || ' ' || browser_version" | "os_name || ' ' || os_version" | "device_vendor || ' ' || device_model", fallback = "(直接访问)") => ({ label, rows: (await env.DB.prepare(`SELECT COALESCE(NULLIF(TRIM(${expression}), ''), ?) name, COUNT(*) count FROM visits GROUP BY ${expression} ORDER BY count DESC LIMIT 12`).bind(fallback).all<{ name: string; count: number }>()).results });
  return json({ totals: { visits: totals?.visits || 0, visitors: totals?.visitors || 0, sites: totals?.sites || 0, avgDuration: totals?.avgDuration || 0 }, groups: await Promise.all([group("站点 ID", "site_id", "(未命名)"), group("来源域名", "referrer_host"), group("页面", "path"), group("国家/地区", "country", "(未知)"), group("IP 地址", "ip_address", "(未知)"), group("浏览器 / 版本", "browser_name || ' ' || browser_version", "(未知)"), group("操作系统 / 版本", "os_name || ' ' || os_version", "(未知)"), group("设备厂商 / 型号", "device_vendor || ' ' || device_model", "(桌面设备)")]) });
}

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/tracker.js") return response(trackerScript(), { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (url.pathname === "/collect") return collect(request, env);
  if (url.pathname === "/api/login") return login(request, env);
  if (url.pathname === "/api/summary") return summary(request, env);
  if (url.pathname === "/" || url.pathname === "/dashboard") return response(dashboard, { headers: { "content-type": "text/html; charset=utf-8" } });
  return response("Not found", { status: 404 });
} } satisfies ExportedHandler<Env>;
import { UAParser } from "ua-parser-js";
