import { handle } from "../server/sistema.mjs";

const routes = {
  painel: "/painel",
  cliente: "/cliente",
  reservas: "/api/reservas",
  "cliente-entrar": "/api/cliente/entrar",
  "cliente-criar-senha": "/api/cliente/criar-senha",
  "cliente-sair": "/api/cliente/sair",
  "cliente-responder": "/api/cliente/responder"
};

export default function (req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/sistema") {
    const route = url.searchParams.get("__rota");
    if (Object.hasOwn(routes, route)) url.pathname = routes[route];
  }
  url.searchParams.delete("__rota");
  req.url = url.pathname + url.search;
  return handle(req, res);
}
