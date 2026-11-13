# Cláudio Bial Recepções

O site recebe solicitações em `POST /api/reservas`. O servidor grava no SQLite e só então devolve um protocolo. A equipe consulta as solicitações em `/painel`.

## Executar

Requer Node.js 24. Defina `ADMIN_PASSWORD` com uma senha longa e exclusiva e execute `npm start`. Abra `http://127.0.0.1:3000`. Para o painel, use o usuário `admin` e a senha configurada.

## Hospedar

Use um servidor Node.js com HTTPS e um volume persistente. Configure `DATABASE_PATH` para um arquivo nesse volume, `ADMIN_PASSWORD` como segredo e `HOST` e `PORT` conforme a hospedagem. A aplicação escuta em `127.0.0.1:3000` por padrão. Guarde cópias do banco usando o mecanismo de backup do SQLite. Hospedagem de HTML estático não executa a API de reservas.

A confirmação da página indica que a solicitação foi gravada. A equipe consulta o painel e responde pelo e-mail informado.
