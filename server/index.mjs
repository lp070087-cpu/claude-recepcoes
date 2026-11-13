import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 16) throw new Error("Defina ADMIN_PASSWORD com pelo menos 16 caracteres.");

const databasePath = resolve(process.env.DATABASE_PATH || "data/reservas.sqlite");
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS reservas (
    request_id TEXT PRIMARY KEY,
    protocolo TEXT NOT NULL UNIQUE,
    criado_em TEXT NOT NULL,
    dados TEXT NOT NULL
  )
`);
const insert = db.prepare("INSERT INTO reservas VALUES (?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING");
const byId = db.prepare("SELECT protocolo, dados FROM reservas WHERE request_id = ?");
const recent = db.prepare("SELECT protocolo, criado_em, dados FROM reservas ORDER BY criado_em DESC LIMIT 50 OFFSET ?");
const files = new Map([
  ["/", [readFileSync(new URL("../public/index.html", import.meta.url)), "text/html; charset=utf-8"]],
  ["/reserva.js", [readFileSync(new URL("../public/reserva.js", import.meta.url)), "text/javascript; charset=utf-8"]]
]);
for (let index = 1; index <= 9; index += 1) {
  const path = "/foto-" + index + ".jpg";
  files.set(path, [readFileSync(new URL("../public" + path, import.meta.url)), "image/jpeg"]);
}
const events = ["Casamento", "Mini wedding", "Festa de 15 anos", "Renovação de votos", "Outra celebração"];
const services = ["", "Espaço", "Decoração", "Recepção completa"];
const limits = { name: 100, email: 160, event: 40, service: 40, date: 10, guests: 4, venue: 120, notes: 600 };
const digest = (value) => createHash("sha256").update(value).digest();
const adminDigest = digest("admin:" + password);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);

function respond(res, code, body, contentType, headers = {}) {
  res.writeHead(code, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}
const json = (res, code, value) => respond(res, code, JSON.stringify(value), "application/json; charset=utf-8");

function authorized(header = "") {
  if (!header.startsWith("Basic ")) return false;
  return timingSafeEqual(adminDigest, digest(Buffer.from(header.slice(6), "base64")));
}

function panel(offset) {
  const rows = recent.all(offset);
  const labels = {name:"Nome",email:"E-mail",event:"Evento",service:"Serviço",date:"Data prevista",guests:"Convidados",venue:"Local",notes:"Detalhes"};
  const cards = rows.map(({protocolo, criado_em, dados}) => {
    const fields = Object.entries(JSON.parse(dados)).filter(([, value]) => value)
      .map(([key, value]) => `<dt>${escape(labels[key])}</dt><dd>${escape(value)}</dd>`).join("");
    const date = new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Recife"}).format(new Date(criado_em));
    return `<article><h2>${escape(protocolo)}</h2><p>Recebida em ${escape(date)}</p><dl>${fields}</dl></article>`;
  });
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reservas · Cláudio Bial</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5efe4;color:#253026;font:16px/1.5 system-ui}main{width:min(900px,calc(100% - 32px));margin:3rem auto}
    article{background:#fffbf2;border:1px solid #d4c5b0;padding:20px;margin:14px 0}h2,p{margin:0}dl{display:grid;grid-template-columns:minmax(90px,130px) 1fr;gap:5px 12px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}nav{display:flex;gap:20px}a{color:inherit}
    </style><main><a href="/">Voltar ao site</a><h1>Solicitações de reserva</h1>
    ${cards.join("") || "<p>Nenhuma solicitação nesta página.</p>"}
    <nav aria-label="Paginação">${offset ? `<a href="?inicio=${offset-50}">Anteriores</a>` : ""}
    ${rows.length === 50 ? `<a href="?inicio=${offset+50}">Próximas</a>` : ""}</nav></main></html>`;
}

async function reservation(req, res) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) {
    return json(res, 415, { error: "Abra a página do site para enviar a solicitação." });
  }
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) {
      json(res, 413, { error: "Os detalhes excedem o limite de envio." });
      return;
    }
    raw += chunk;
  }
  let input;
  try { input = JSON.parse(raw); } catch { return json(res, 400, { error: "Dados de envio inválidos." }); }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      typeof input.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestId)) {
    return json(res, 400, { error: "Solicitação inválida. Atualize a página e tente novamente." });
  }

  const data = {};
  for (const [field, limit] of Object.entries(limits)) {
    const value = input[field] ?? "";
    if (typeof value !== "string" || value.length > limit) {
      return json(res, 422, { error: "Confira os campos e o tamanho dos detalhes." });
    }
    data[field] = value.trim();
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Recife" }).format(new Date());
  const calendarDate = Date.parse(data.date);
  const invalidDate = data.date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(calendarDate) ||
    new Date(calendarDate).toISOString().slice(0,10) !== data.date || data.date < today);
  if (data.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
      !events.includes(data.event) || !services.includes(data.service) || invalidDate ||
      (data.guests && !/^[1-9]\d{0,3}$/.test(data.guests))) {
    return json(res, 422, { error: "Confira o nome, o e-mail e os dados do evento. A data deve ser hoje ou futura." });
  }

  const payload = JSON.stringify(data);
  const protocol = "CB-" + randomUUID().slice(0, 12).replace("-", "").toUpperCase();
  const saved = insert.run(input.requestId, protocol, new Date().toISOString(), payload);
  const record = byId.get(input.requestId);
  if (record.dados !== payload) return json(res, 409, { error: "Os dados foram alterados. Atualize a página e tente novamente." });
  return json(res, saved.changes ? 201 : 200, { protocol: record.protocolo });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && files.has(url.pathname)) {
      const [content, type] = files.get(url.pathname);
      return respond(res, 200, content, type);
    }
    if (req.method === "POST" && url.pathname === "/api/reservas") return await reservation(req, res);
    if (req.method === "GET" && url.pathname === "/painel") {
      if (!authorized(req.headers.authorization)) {
        return respond(res, 401, "Acesso restrito à equipe.", "text/plain; charset=utf-8", {
          "WWW-Authenticate": 'Basic realm="Reservas", charset="UTF-8"'
        });
      }
      const offset = Number(url.searchParams.get("inicio") ?? 0);
      return respond(res, 200, panel(Number.isSafeInteger(offset) && offset >= 0 && offset % 50 === 0 ? offset : 0), "text/html; charset=utf-8");
    }
    return json(res, 404, { error: "Página não encontrada." });
  } catch (error) {
    console.error(error.name);
    if (!res.headersSent) json(res, 503, { error: "O sistema está indisponível no momento. Tente novamente." });
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || "127.0.0.1", () => {
  console.log("Servidor de reservas na porta " + server.address().port);
});
