import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getStore } from "./store.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const derive = promisify(scrypt);
const sessionTime = 60 * 60 * 24 * 7;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const events = ["Casamento","Mini wedding","Festa de 15 anos","Renovação de votos","Outra celebração"];
const services = ["","Espaço","Decoração","Recepção completa"];
const limits = {name:100,email:160,event:40,service:40,date:10,guests:4,venue:120,notes:600};
const labels = {name:"Nome",email:"E-mail",event:"Evento",service:"Serviço",date:"Data prevista",guests:"Convidados",venue:"Local",notes:"Detalhes"};

function respond(res, status, value, type = "application/json; charset=utf-8", headers = {}) {
  res.writeHead(status, {"Content-Type":type,"Cache-Control":"no-store","Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",...headers});
  res.end(type.startsWith("application/json") ? JSON.stringify(value) : value);
}
const fail = (res, status, error) => respond(res,status,{error});

async function input(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) return null;
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body).length <= 8192 ? req.body : null;
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) return null;
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return null; }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return !req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"] === "same-origin";
  try { return new URL(origin).host === req.headers.host && req.headers["sec-fetch-site"] !== "cross-site"; }
  catch { return false; }
}

function isAdmin(req) {
  const password = process.env.ADMIN_PASSWORD;
  const header = req.headers.authorization ?? "";
  if (!password || password.length < 16 || !header.startsWith("Basic ")) return false;
  const supplied = hash(Buffer.from(header.slice(6),"base64"));
  return timingSafeEqual(Buffer.from(supplied),Buffer.from(hash("admin:" + password)));
}

function reserveData(body) {
  const data = {};
  for (const [key, limit] of Object.entries(limits)) {
    const value = body[key] ?? "";
    if (typeof value !== "string" || value.length > limit) return null;
    data[key] = value.trim();
  }
  data.email = data.email.toLowerCase();
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Recife"}).format(new Date());
  const parsed = Date.parse(data.date);
  const validDate = !data.date || (/^\d{4}-\d{2}-\d{2}$/.test(data.date) && Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0,10) === data.date && data.date >= today);
  if (data.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
      !events.includes(data.event) || !services.includes(data.service) || !validDate ||
      (data.guests && !/^[1-9]\d{0,3}$/.test(data.guests))) return null;
  return data;
}

function cookie(req, name) {
  return (req.headers.cookie || "").split(/;\s*/).find((part) => part.startsWith(name+"="))?.slice(name.length+1) || "";
}
function sessionCookie(key, maxAge = sessionTime) {
  return `cb_sessao=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.VERCEL ? "; Secure" : ""}`;
}

async function reservation(req, res, db, body) {
  const data = reserveData(body);
  if (!data || typeof body.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.requestId) ||
      typeof body.accessKey !== "string" || !/^[\w-]{43}$/.test(body.accessKey)) {
    return fail(res,422,"Confira os dados do evento e o e-mail.");
  }
  // The proof stays in this browser and is never sent in a URL or displayed to the team.
  const requestId = hash(body.requestId + ":" + body.accessKey);
  const protocol = "CB-" + randomUUID().replaceAll("-","").slice(0,14).toUpperCase();
  const payload = JSON.stringify(data);
  const inserted = await db("INSERT INTO reservas VALUES (?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING RETURNING protocolo",
    requestId,protocol,new Date().toISOString(),payload);
  const [saved] = await db("SELECT protocolo, dados FROM reservas WHERE request_id = ?",requestId);
  if (saved.dados !== payload) return fail(res,409,"Os dados do envio mudaram. Revise e tente novamente.");
  respond(res,inserted.length ? 201 : 200,{protocol:saved.protocolo});
}

async function customerAction(req,res,db,body,action) {
  if (action === "sair") {
    await db("DELETE FROM sessoes WHERE chave = ?",hash(cookie(req,"cb_sessao")));
    return respond(res,200,{ok:true},undefined,{"Set-Cookie":sessionCookie("",0)});
  }
  const { protocol, password } = body;
  if (typeof protocol !== "string" || !/^CB-[A-F0-9]{10,32}$/.test(protocol) ||
      typeof password !== "string" || password.length < 12 || password.length > 128) {
    return fail(res,422,"Confira o protocolo e use uma senha de pelo menos 12 caracteres.");
  }
  if (action === "criar-senha") {
    if (typeof body.requestId !== "string" || typeof body.accessKey !== "string") return fail(res,403,"Abra o pedido no navegador usado para enviá-lo.");
    const [booking] = await db("SELECT dados FROM reservas WHERE protocolo = ? AND request_id = ?",protocol,hash(body.requestId+":"+body.accessKey));
    if (!booking) return fail(res,403,"Abra o pedido no navegador usado para enviá-lo.");
    const salt = token();
    const key = (await derive(password,salt,32)).toString("hex");
    const created = await db("INSERT INTO acessos VALUES (?, ?, ?) ON CONFLICT(protocolo) DO NOTHING RETURNING protocolo",
      protocol,JSON.parse(booking.dados).email,salt+":"+key);
    if (!created.length) return fail(res,409,"Este pedido já tem senha. Use a opção Entrar.");
  } else {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const [account] = await db("SELECT senha FROM acessos WHERE protocolo = ? AND email = ?",protocol,email);
    const [salt, stored] = (account?.senha || "missing:" + "0".repeat(64)).split(":");
    const key = await derive(password,salt,32);
    if (!timingSafeEqual(Buffer.from(stored,"hex"),key) || !account) return fail(res,401,"E-mail, protocolo ou senha incorretos.");
  }
  const key = token();
  await db("INSERT INTO sessoes VALUES (?, ?, ?)",hash(key),protocol,Date.now()+sessionTime*1000);
  respond(res,200,{ok:true},undefined,{"Set-Cookie":sessionCookie(key)});
}

function page(title, content) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Cláudio Bial</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#f5efe4;color:#253026;font:16px/1.55 system-ui}main{width:min(760px,calc(100% - 32px));margin:40px auto}article,form{background:#fffaf0;border:1px solid #d4c5b0;padding:20px;margin:16px 0}h1,h2{font-family:Georgia,serif;font-weight:400}label{display:block;margin:12px 0}input,textarea{display:block;width:100%;padding:10px;font:inherit}button{background:#253026;color:#fff;border:0;padding:12px;font:inherit;cursor:pointer}dd{margin:0 0 8px;overflow-wrap:anywhere;white-space:pre-wrap}dt{font-weight:600}a{color:inherit}p{overflow-wrap:anywhere;white-space:pre-wrap}</style></head><body><main><a href="/">Voltar ao site</a><h1>${title}</h1>${content}</main><script src="/area.js" defer></script></body></html>`;
}
function bookingCard(row) {
  const fields = Object.entries(JSON.parse(row.dados)).filter(([key,value])=>labels[key]&&value)
    .map(([key,value])=>`<dt>${labels[key]}</dt><dd>${escape(value)}</dd>`).join("");
  return `<h2>${escape(row.protocolo)}</h2><dl>${fields}</dl>`;
}
async function customerPage(req,res,db) {
  const key = cookie(req,"cb_sessao");
  const [row] = key ? await db(`SELECT r.*, p.texto FROM sessoes s JOIN reservas r ON r.protocolo=s.protocolo
    LEFT JOIN respostas p ON p.protocolo=r.protocolo WHERE s.chave = ? AND s.expira > ?`,hash(key),Date.now()) : [];
  const content = row ? `<article>${bookingCard(row)}<h2>Resposta da equipe</h2><p>${escape(row.texto || "Aguardando resposta de Cláudio Bial.")}</p>
    <a href="https://wa.me/5581984927347?text=${encodeURIComponent("Olá, Cláudio! Gostaria de acompanhar o pedido "+row.protocolo+".")}">Conversar pelo WhatsApp</a></article><button type="button" data-logout>Sair</button>` :
    `<form data-access hidden><p data-account-email></p><label data-login>Seu e-mail<input name="email" type="email" autocomplete="username" required></label>
    <label data-login>Protocolo<input name="protocol" required></label><label>Senha<input name="password" type="password" minlength="12" maxlength="128" autocomplete="current-password" required></label>
    <button type="submit">Entrar</button> <button type="button" data-switch-login hidden>Já tenho senha</button><p data-feedback role="status"></p></form><noscript>Ative o JavaScript para acessar seu pedido.</noscript>`;
  respond(res,200,page("Área do cliente",content),"text/html; charset=utf-8");
}
async function panel(req,res,db,url) {
  const offset = Number(url.searchParams.get("inicio") || 0);
  const start = Number.isSafeInteger(offset) && offset >= 0 && offset % 30 === 0 ? offset : 0;
  const rows = await db(`SELECT r.*, p.texto FROM reservas r LEFT JOIN respostas p ON p.protocolo=r.protocolo
    ORDER BY r.criado_em DESC LIMIT 30 OFFSET ?`,start);
  const cards = rows.map(row=>`<article>${bookingCard(row)}<form data-reply data-protocol="${escape(row.protocolo)}">
    <label>Resposta para o cliente<textarea name="reply" maxlength="2000" rows="3" required>${escape(row.texto || "")}</textarea></label>
    <button>Salvar resposta</button><p data-feedback role="status"></p></form></article>`).join("");
  const links = `<nav>${start ? `<a href="?inicio=${start-30}">Anteriores</a> ` : ""}${rows.length === 30 ? `<a href="?inicio=${start+30}">Próximas</a>` : ""}</nav>`;
  respond(res,200,page("Solicitações de reserva",(cards || "<p>Nenhuma solicitação nesta página.</p>")+links),"text/html; charset=utf-8");
}
export async function handle(req,res) {
  try {
    const original = req.url;
    const url = new URL(original,"http://localhost");
    const path = url.pathname;
    const staff = path === "/painel" || path === "/api/cliente/responder";
    if (staff && !isAdmin(req)) return respond(res,401,"Acesso restrito à equipe.","text/plain; charset=utf-8",{"WWW-Authenticate":'Basic realm="Reservas", charset="UTF-8"'});
    if (req.method === "GET" && path === "/cliente") {
      return await customerPage(req,res,await getStore());
    }
    if (req.method === "GET" && path === "/painel") return await panel(req,res,await getStore(),url);
    if (req.method !== "POST" || !sameOrigin(req)) return fail(res,404,"Página não encontrada.");
    const body = await input(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(res,400,"Dados de envio inválidos.");
    const db = await getStore();
    if (path === "/api/reservas") return await reservation(req,res,db,body);
    if (path === "/api/cliente/responder") {
      if (typeof body.reply !== "string" || !body.reply.trim() || body.reply.length > 2000 || typeof body.protocol !== "string") return fail(res,422,"Preencha a resposta.");
      const [saved] = await db(`INSERT INTO respostas SELECT protocolo, ?, ? FROM reservas WHERE protocolo = ?
        ON CONFLICT(protocolo) DO UPDATE SET texto=excluded.texto, atualizado_em=excluded.atualizado_em RETURNING protocolo`,
        body.reply.trim(),new Date().toISOString(),body.protocol);
      return saved ? respond(res,200,{ok:true}) : fail(res,404,"Pedido não encontrado.");
    }
    const action = path.split("/").at(-1);
    if (["/api/cliente/criar-senha","/api/cliente/entrar","/api/cliente/sair"].includes(path)) return await customerAction(req,res,db,body,action);
    return fail(res,404,"Página não encontrada.");
  } catch (error) {
    console.error(error.name);
    if (!res.headersSent) fail(res,503,"O sistema está indisponível no momento. Tente novamente.");
  }
}
