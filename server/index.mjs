import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { handle } from "./sistema.mjs";

const assets = {
  "/": ["index.html","text/html; charset=utf-8"],
  "/reserva.js": ["reserva.js","text/javascript; charset=utf-8"],
  "/area.js": ["area.js","text/javascript; charset=utf-8"]
};
for (let i=1;i<=9;i++) assets["/foto-"+i+".jpg"] = ["foto-"+i+".jpg","image/jpeg"];

const server = createServer((req,res)=>{
  const path = new URL(req.url,"http://localhost").pathname;
  if (req.method === "GET" && Object.hasOwn(assets,path)) {
    const [file,type] = assets[path];
    res.writeHead(200,{"Content-Type":type,"X-Content-Type-Options":"nosniff"});
    res.end(readFileSync(new URL("../public/"+file,import.meta.url)));
    return;
  }
  void handle(req,res);
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || "127.0.0.1",()=>{
  console.log("Servidor de reservas na porta "+server.address().port);
});
