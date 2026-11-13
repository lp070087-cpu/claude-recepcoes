# Cláudio Bial Recepções

O formulário salva a solicitação no sistema e entrega um protocolo. No mesmo navegador, o cliente cria apenas a senha. Para voltar em outro aparelho, usa o e-mail, o protocolo e a senha. A equipe responde pelo painel e o cliente lê a resposta em `/cliente`. O link de WhatsApp fica na área do cliente como opção de atendimento.

## Executar localmente

Com Node.js 24, rode `npm ci`, configure `ADMIN_PASSWORD` com uma senha exclusiva de pelo menos 16 caracteres e execute `npm start`. Acesse `http://127.0.0.1:3000`. O painel em `/painel` usa o usuário `admin` e a senha configurada. O banco SQLite fica em `data/reservas.sqlite` por padrão. Defina `DATABASE_PATH` para mudar o local.

## Vercel

Configure `DATABASE_URL` com a conexão PostgreSQL (por exemplo, a URL com pool do Neon) e `ADMIN_PASSWORD` em **Settings → Environment Variables → Production**, depois faça um novo deploy. A função cria as tabelas no primeiro acesso com o banco configurado. Se já existirem reservas em um SQLite de outra instalação, elas permanecem nele e precisam ser migradas antes de desativá-lo.
