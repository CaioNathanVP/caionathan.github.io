# Contador de visitas do portfólio

API pequena em Cloudflare Workers com banco D1 que conta as visitas do portfólio e alimenta o painel privado (`painel.html`, na raiz do site).

Não guarda IP nem user agent e não usa cookies. Cada visita grava só a hora, o caminho da página, a origem (LinkedIn, Google, GitHub, direto ou o domínio de onde veio) e o país informado pela Cloudflare.

## Como funciona

```
visitante ── contador.js (sendBeacon) ──► POST /v ──────────────────────► D1 (tabela visita)
painel.html ── painel.js ───────────────► GET /estatisticas (Bearer chave) ► D1
```

- `POST /v`: aceita só pedidos com `Origin` igual a `ORIGEM_SITE`. Ignora robôs e conta uma vez por sessão da aba (controle em `contador.js`).
- `GET /estatisticas?dias=7|30|90`: exige a chave do painel. Devolve o total, as visitas por dia e por hora (horário de Brasília), as origens e os países.
- Quem abre o painel num navegador deixa de ser contado nele (`localStorage['contador:ignorar']`).

## Desenvolvimento

Rode os comandos dentro de `contador/`. Não precisa de conta na Cloudflare para isso.

```bash
npm ci
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npx wrangler d1 migrations apply portfolio-contador --local
```

```bash
npm run dev
```

O Worker sobe em http://localhost:8787. Sirva o site na porta 8765 (por exemplo, `npx http-server .. -p 8765`): `contador.js` e `painel.js` usam o Worker local quando o host é `localhost`. No painel, a chave é `dev`.

Testes (rodam no runtime dos Workers, com D1 local):

```bash
npm test
```

Checagem de tipos:

```bash
npm run verificar
```

## Deploy

1. Crie uma conta na Cloudflare e faça o login:

   ```bash
   npx wrangler login
   ```

2. Crie o banco e copie o `database_id` devolvido para o `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create portfolio-contador
   ```

3. Aplique a migration no banco remoto:

   ```bash
   npx wrangler d1 migrations apply portfolio-contador --remote
   ```

4. Grave a chave do painel. Gere uma com `openssl rand -hex 32` e cole quando o comando pedir:

   ```bash
   npx wrangler secret put CHAVE_PAINEL
   ```

5. Publique:

   ```bash
   npm run deploy
   ```

6. Copie a URL `https://portfolio-contador.<conta>.workers.dev` para `URL_PRODUCAO` em `../contador.js` e `../painel.js` e publique o site.

O painel fica em `https://caionathanvp.github.io/caionathan.github.io/painel.html`. Ele não tem link no portfólio e não é indexado.

## Ver as visitas direto no banco

```bash
npx wrangler d1 execute portfolio-contador --remote --command "SELECT datetime(criada_em / 1000 - 10800, 'unixepoch') AS hora_brasilia, caminho, origem, pais FROM visita ORDER BY id DESC LIMIT 20"
```
