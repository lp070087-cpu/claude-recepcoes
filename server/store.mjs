import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const schema = [
  `CREATE TABLE IF NOT EXISTS reservas (
    request_id TEXT PRIMARY KEY, protocolo TEXT NOT NULL UNIQUE,
    criado_em TEXT NOT NULL, dados TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS acessos (
    protocolo TEXT PRIMARY KEY, email TEXT NOT NULL, senha TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessoes (
    chave TEXT PRIMARY KEY, protocolo TEXT NOT NULL, expira BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS respostas (
    protocolo TEXT PRIMARY KEY, texto TEXT NOT NULL, atualizado_em TEXT NOT NULL
  )`
];
let storePromise;
export function getStore() {
  storePromise ??= openStore().catch((error) => {
    storePromise = undefined;
    throw error;
  });
  return storePromise;
}
async function openStore() {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000});
    try { for (const query of schema) await pool.query(query); }
    catch (error) { await pool.end(); throw error; }
    return async (sql, ...params) => {
      let position = 0;
      return (await pool.query(sql.replaceAll("?", () => "$" + ++position), params)).rows;
    };
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL ausente");
  const { DatabaseSync } = await import("node:sqlite");
  const path = resolve(process.env.DATABASE_PATH || "data/reservas.sqlite");
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
  for (const query of schema) db.exec(query);
  return async (sql, ...params) => db.prepare(sql).all(...params);
}
