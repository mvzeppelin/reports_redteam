# Plataforma de Gerenciamento de Relatórios

Sistema web para upload, organização e visualização de relatórios HTML estáticos — voltado para times de Red Team, pentest e segurança ofensiva que utilizam ferramentas de IA para gerar apresentações e relatórios interativos.

O acesso é protegido por autenticação _passwordless_ via OTP enviado por e-mail, sem senhas armazenadas. Toda operação sensível é registrada em log de auditoria.

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Como executar](#como-executar)
- [Gerenciamento de relatórios](#gerenciamento-de-relatórios)
- [Painel administrativo](#painel-administrativo)
- [Operações no banco de dados](#operações-no-banco-de-dados)
- [Gerenciar bloqueios (Redis)](#gerenciar-bloqueios-redis)
- [Log de auditoria](#log-de-auditoria)
- [Autenticação — como funciona](#autenticação--como-funciona)
- [Segurança](#segurança)
- [Configuração avançada](#configuração-avançada)
- [Portas e HTTPS](#portas-e-https)

---

## Funcionalidades

### Relatórios (todos os usuários autenticados)
- Upload de sites HTML estáticos empacotados em `.zip`
- Extração segura com proteção contra path traversal, ZIP bomb e extensões maliciosas
- Listagem com nome, status, tamanho, contagem de arquivos, autor e data
- Ativação/desativação de relatório (desativado não pode ser aberto)
- Remoção permanente com exclusão dos arquivos do disco
- Visualização do relatório renderizado diretamente no browser (nova aba)
- Suporte completo a HTML + CSS + JS + imagens + fontes + PDF

### Painel administrativo (somente admins)
- **Usuários** — criar, ativar/desativar, promover/revogar admin, excluir
- **Sessões Ativas** — listar todas as sessões em tempo real e invalidá-las individualmente
- **Histórico** — log de auditoria paginado com filtros por evento, e-mail e IP

### Autenticação
- Login _passwordless_ via OTP de 7 dígitos enviado por e-mail
- Sessão com cookie HttpOnly + SameSite=Strict, válida por 24 horas
- Sem senhas armazenadas — OTP e token de sessão guardados apenas como HMAC-SHA256

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                      Docker Compose                     │
│                                                         │
│  ┌──────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │ frontend │     │   backend    │    │   mailhog    │  │
│  │  Nginx   │────▶│  Node.js     │    │ (SMTP + UI)  │  │
│  │  80/443  │     │  porta 3001  │    │  porta 8025  │  │
│  └──────────┘     └──────┬───────┘    └──────────────┘  │
│                          │                              │
│               ┌──────────┴──────────┐                   │
│               │                     │                   │
│        ┌──────▼─────┐      ┌────────▼───┐               │
│        │  postgres  │      │   redis    │               │
│        │  banco     │      │   cache    │               │
│        └────────────┘      └────────────┘               │
│                                                         │
│  ./Reports ──────────────▶ /app/reports  (volume)       │
└─────────────────────────────────────────────────────────┘
```

| Serviço    | Tecnologia                        | Função                                                       |
|------------|-----------------------------------|--------------------------------------------------------------|
| `frontend` | React + TypeScript + Nginx        | SPA; proxy reverso para o backend; uploads até 55 MB         |
| `backend`  | Node.js + Express + TypeScript    | API REST; extração de ZIPs; serving de arquivos estáticos    |
| `postgres` | PostgreSQL 16                     | Usuários, OTPs, sessões, relatórios, auditoria               |
| `redis`    | Redis 7                           | Rate limiting e cooldown de e-mail                           |
| `mailhog`  | MailHog                           | Servidor SMTP local para desenvolvimento (captura e-mails)   |
| `Reports/` | Volume bind mount                 | Arquivos extraídos dos relatórios (`./Reports:/app/reports`) |

### Stack de tecnologias

**Backend**
- `express` — framework HTTP
- `pg` — driver PostgreSQL
- `ioredis` — cliente Redis
- `multer` — upload de arquivos multipart
- `unzipper` — extração segura de ZIPs
- `mime-types` — detecção de MIME para serving de estáticos
- `nodemailer` — envio de e-mail via SMTP (desenvolvimento / MailHog)
- `resend` — envio de e-mail via API Resend (produção)
- `helmet` — headers de segurança HTTP
- `cookie-parser` — leitura de cookies `httpOnly`
- `crypto` (nativo Node.js) — geração de OTP e hashing HMAC-SHA256

**Frontend**
- `react` + `react-router-dom` — SPA com rotas protegidas por autenticação e role
- `typescript` — tipagem estática
- `vite` — build tool

---

## Como executar

### Pré-requisitos

- Docker e Docker Compose instalados

### 1. Clonar e configurar

```bash
cp .env.example .env
```

Para desenvolvimento local, o `.env` já vem preenchido com valores funcionais apontando para o MailHog.

### 2. Criar a pasta de relatórios (se não existir)

```bash
mkdir -p Reports
```

### 3. Subir os serviços

```bash
docker compose up --build
```

| URL                      | Descrição                                |
|--------------------------|------------------------------------------|
| `http://localhost`       | Plataforma (login → relatórios)          |
| `http://localhost:8025`  | MailHog — visualizar e-mails de OTP      |

> As portas HTTP e HTTPS podem ser alteradas via `HTTP_PORT` e `HTTPS_PORT` no `.env` — veja [Portas e HTTPS](#portas-e-https).

### 4. Adicionar o primeiro usuário e promovê-lo a admin

```bash
# Adicionar usuário
docker compose exec postgres psql -U auth_user -d auth_db \
  -c "INSERT INTO users (email) VALUES ('seu@email.com') ON CONFLICT DO NOTHING;"

# Promover a admin
docker compose exec postgres psql -U auth_user -d auth_db \
  -c "UPDATE users SET is_admin = TRUE WHERE email = 'seu@email.com';"
```

### 5. Parar os serviços

```bash
# Para sem remover dados
docker compose down

# Para e remove volumes (apaga banco e cache)
docker compose down -v
```

---

## Gerenciamento de relatórios

### Fazer upload de um relatório

1. Empacote o site HTML estático em um arquivo `.zip`
   - O ZIP pode conter uma pasta raiz (ex: `relatorio/index.html`) — o sistema detecta e remove automaticamente o diretório raiz interno
   - É obrigatório existir um `index.html` na raiz (ou dentro da pasta raiz única)
2. Acesse **Relatórios** após o login
3. Preencha o nome do relatório e selecione o arquivo `.zip`
4. Clique em **Fazer upload** — uma barra de progresso exibe o andamento

### Limites e formatos aceitos

| Parâmetro               | Valor       |
|-------------------------|-------------|
| Tamanho máximo do ZIP   | 50 MB       |
| Tamanho descomprimido   | 200 MB      |
| Máximo de arquivos      | 500         |
| Extensões permitidas    | `.html` `.htm` `.css` `.js` `.mjs` `.json` `.png` `.jpg` `.jpeg` `.gif` `.svg` `.ico` `.webp` `.woff` `.woff2` `.ttf` `.eot` `.pdf` `.txt` `.xml` `.map` `.mp4` `.webm` |

### Segurança no upload

- **Path traversal**: entradas com `..`, caminhos absolutos ou null bytes são rejeitadas
- **Symlinks**: entradas do tipo link são rejeitadas
- **ZIP bomb**: tamanho total descomprimido monitorado; ultrapassa 200 MB → rejeitado
- **Extensões maliciosas**: qualquer extensão fora da whitelist é rejeitada
- **MIME sniffing**: `X-Content-Type-Options: nosniff` + MIME type explícito por arquivo
- **Autenticação obrigatória**: todos os endpoints de relatório exigem sessão válida
- **Anti-traversal no serving**: caminho resolvido validado contra `REPORTS_DIR/{uuid}` antes de servir

### Ações disponíveis

| Ação           | Descrição                                                     |
|----------------|---------------------------------------------------------------|
| **Abrir**      | Abre o relatório renderizado em nova aba (só se ativo)        |
| **Desativar**  | Impede acesso ao relatório; URL direta retorna 403            |
| **Ativar**     | Reativa um relatório desativado                               |
| **Remover**    | Exclui o registro do banco e todos os arquivos do disco       |

### Gerenciar relatórios via banco

```bash
docker compose exec postgres psql -U auth_user -d auth_db
```

**Listar todos os relatórios:**
```sql
SELECT r.id, r.name, r.is_active, r.file_count,
       pg_size_pretty(r.size_bytes) AS tamanho,
       u.email AS enviado_por, r.created_at
FROM reports r
LEFT JOIN users u ON u.id = r.uploaded_by
ORDER BY r.created_at DESC;
```

**Desativar um relatório:**
```sql
UPDATE reports SET is_active = FALSE WHERE id = '<uuid>';
```

**Reativar um relatório:**
```sql
UPDATE reports SET is_active = TRUE WHERE id = '<uuid>';
```

**Excluir registro do banco** (os arquivos em disco devem ser removidos manualmente):
```sql
DELETE FROM reports WHERE id = '<uuid>';
```

**Remover arquivos do disco após exclusão no banco:**
```bash
rm -rf ./Reports/<uuid>
```

**Listar relatórios de um usuário específico:**
```sql
SELECT r.id, r.name, r.is_active, r.created_at
FROM reports r
JOIN users u ON u.id = r.uploaded_by
WHERE u.email = 'usuario@email.com'
ORDER BY r.created_at DESC;
```

---

## Painel administrativo

Usuários com `is_admin = TRUE` acessam o painel pelo botão **"Painel Administrativo"** na tela de boas-vindas.

### Abas do painel

| Aba                | O que permite                                                                          |
|--------------------|----------------------------------------------------------------------------------------|
| **Usuários**       | Criar, ativar/desativar, promover/revogar admin e excluir usuários                     |
| **Sessões Ativas** | Listar todas as sessões autenticadas em tempo real e invalidá-las individualmente       |
| **Histórico**      | Log de auditoria paginado com filtros por evento, e-mail e IP                          |

### Controles de acesso do painel

- Usuários sem `is_admin` não veem o botão e recebem `403` em qualquer tentativa de acesso a `/admin/*`
- O painel exibe **(você)** ao lado da conta logada e desabilita ações destrutivas sobre ela (excluir, desativar, revogar admin)
- Um admin não pode revogar seu próprio acesso pelo painel — apenas via banco ou por outro administrador

---

## Operações no banco de dados

### Conectar ao banco

```bash
docker compose exec postgres psql -U auth_user -d auth_db
```

---

### Usuários

**Listar todos os usuários:**
```sql
SELECT id, email, is_active, is_admin, created_at
FROM users
ORDER BY created_at DESC;
```

**Adicionar um usuário:**
```sql
INSERT INTO users (email) VALUES ('novo@email.com');
```

**Adicionar múltiplos usuários:**
```sql
INSERT INTO users (email) VALUES
  ('alice@empresa.com'),
  ('bob@empresa.com'),
  ('carol@empresa.com')
ON CONFLICT (email) DO NOTHING;
```

**Desativar um usuário** (histórico preservado, sem acesso):
```sql
UPDATE users SET is_active = FALSE WHERE email = 'usuario@email.com';
```

**Reativar um usuário:**
```sql
UPDATE users SET is_active = TRUE WHERE email = 'usuario@email.com';
```

**Excluir um usuário permanentemente:**
```sql
DELETE FROM users WHERE email = 'usuario@email.com';
```
> As tabelas `otp_codes` e `sessions` têm `ON DELETE CASCADE`. Os relatórios do usuário são preservados (`uploaded_by` vira `NULL`).

---

### Administradores

**Promover a administrador** (o usuário precisa existir antes):
```bash
docker compose exec postgres psql -U auth_user -d auth_db \
  -c "UPDATE users SET is_admin = TRUE WHERE email = 'seu@email.com';"
```

**Revogar acesso de administrador:**
```sql
UPDATE users SET is_admin = FALSE WHERE email = 'usuario@email.com';
```

**Listar todos os admins:**
```sql
SELECT email, is_active, created_at
FROM users
WHERE is_admin = TRUE;
```

---

### Sessões

**Invalidar a sessão ativa de um usuário** (força re-autenticação imediata):
```sql
UPDATE sessions
SET invalidated_at = NOW()
WHERE user_id = (SELECT id FROM users WHERE email = 'usuario@email.com')
  AND invalidated_at IS NULL;
```

**Listar sessões ativas no momento:**
```sql
SELECT s.id, u.email, s.created_at, s.expires_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.invalidated_at IS NULL
  AND s.expires_at > NOW()
ORDER BY s.created_at DESC;
```

**Invalidar todas as sessões ativas (logout global):**
```sql
UPDATE sessions SET invalidated_at = NOW() WHERE invalidated_at IS NULL;
```

---

### Limpeza de auditoria

**Ver tamanho da tabela:**
```sql
SELECT COUNT(*) AS total,
       pg_size_pretty(pg_total_relation_size('audit_logs')) AS tamanho
FROM audit_logs;
```

**Remover registros mais antigos que 90 dias:**
```sql
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

**Remover apenas eventos de tipo específico** (ex: limpar rate limit antigos):
```sql
DELETE FROM audit_logs
WHERE event_type IN ('RATE_LIMIT_OTP_REQUEST', 'RATE_LIMIT_OTP_VERIFY')
  AND created_at < NOW() - INTERVAL '30 days';
```

**Remover tudo** (use apenas em desenvolvimento):
```sql
TRUNCATE audit_logs;
```

---

## Gerenciar bloqueios (Redis)

Os bloqueios são armazenados no Redis com TTL automático — expiram sozinhos, mas podem ser removidos manualmente.

### Conectar ao Redis

```bash
docker compose exec redis redis-cli
```

Ou executar um comando direto:
```bash
docker compose exec redis redis-cli <COMANDO>
```

### Listar todos os bloqueios ativos

```bash
docker compose exec redis redis-cli KEYS "rl:*"
```

Exemplo de saída:
```
rl:block:otp_ver:192.168.1.10     ← IP bloqueado por excesso de verificações
rl:block:otp_req:192.168.1.20     ← IP bloqueado por excesso de requests
rl:count:otp_ver:192.168.1.10     ← contador de verificações do IP
rl:count:otp_req:192.168.1.20     ← contador de requests do IP
rl:email:usuario@email.com         ← cooldown de 3 min para este e-mail
```

### Ver tempo restante de um bloqueio

```bash
# Bloqueio de verificação para um IP específico
docker compose exec redis redis-cli TTL "rl:block:otp_ver:192.168.1.10"

# Bloqueio de request para um IP específico
docker compose exec redis redis-cli TTL "rl:block:otp_req:192.168.1.10"

# Cooldown de e-mail
docker compose exec redis redis-cli TTL "rl:email:usuario@email.com"
```

> O retorno é em **segundos**. `-2` significa que a chave não existe (sem bloqueio ativo).

### Remover o bloqueio de um IP específico

```bash
IP="192.168.1.10"
docker compose exec redis redis-cli DEL \
  "rl:block:otp_ver:$IP" \
  "rl:block:otp_req:$IP" \
  "rl:count:otp_ver:$IP" \
  "rl:count:otp_req:$IP"
```

### Remover o cooldown de e-mail de um usuário

```bash
docker compose exec redis redis-cli DEL "rl:email:usuario@email.com"
```

### Remover todos os bloqueios de uma vez

```bash
docker compose exec redis redis-cli --scan --pattern "rl:block:*" \
  | xargs -r docker compose exec -T redis redis-cli DEL
```

### Limpar absolutamente tudo no Redis

```bash
docker compose exec redis redis-cli FLUSHDB
```

> **Atenção:** remove **todos os dados do Redis**, incluindo contadores ativos. Use apenas em desenvolvimento ou emergência.

---

## Log de auditoria

Todas as operações relevantes são registradas na tabela `audit_logs` com evento, IP, e-mail e detalhes em JSON.

### Eventos registrados

#### Autenticação
| Evento                      | Quando ocorre                                           |
|-----------------------------|---------------------------------------------------------|
| `OTP_REQUESTED`             | OTP gerado e e-mail enviado                             |
| `OTP_REQUEST_UNKNOWN_EMAIL` | Tentativa com e-mail não cadastrado                     |
| `OTP_VERIFIED`              | OTP verificado com sucesso                              |
| `OTP_INVALID`               | OTP incorreto informado                                 |
| `OTP_EXPIRED`               | OTP correto mas fora do prazo de validade               |
| `OTP_ALREADY_USED`          | Tentativa de reutilizar OTP já consumido                |
| `SESSION_CREATED`           | Nova sessão criada após OTP bem-sucedido                |
| `SESSION_INVALIDATED`       | Sessão invalidada pelo admin ou troca de sessão         |
| `LOGOUT`                    | Usuário fez logout                                      |
| `RATE_LIMIT_OTP_REQUEST`    | IP bloqueado por excesso de requests de OTP             |
| `RATE_LIMIT_OTP_VERIFY`     | IP bloqueado por excesso de tentativas de verificação   |
| `EMAIL_COOLDOWN_ACTIVE`     | Tentativa de novo OTP antes do cooldown expirar         |

#### Relatórios
| Evento                | Quando ocorre                                    | Detalhes registrados                        |
|-----------------------|--------------------------------------------------|---------------------------------------------|
| `REPORT_UPLOADED`     | Upload e extração concluídos com sucesso         | `reportId`, `name`, `fileCount`, `sizeBytes`|
| `REPORT_UPLOAD_FAILED`| Falha no upload (tipo inválido, ZIP corrompido…) | `name`, `error`                             |
| `REPORT_TOGGLED`      | Relatório ativado ou desativado                  | `reportId`, `name`, `is_active`             |
| `REPORT_DELETED`      | Relatório removido permanentemente               | `reportId`, `name`                          |

### Consultas úteis via banco

**Histórico completo de um usuário:**
```sql
SELECT event_type, ip_address, details, created_at
FROM audit_logs
WHERE email = 'usuario@email.com'
ORDER BY created_at DESC
LIMIT 50;
```

**IPs que atingiram rate limit:**
```sql
SELECT ip_address, event_type, COUNT(*) AS ocorrencias, MAX(created_at) AS ultima_vez
FROM audit_logs
WHERE event_type IN ('RATE_LIMIT_OTP_REQUEST', 'RATE_LIMIT_OTP_VERIFY')
GROUP BY ip_address, event_type
ORDER BY ocorrencias DESC;
```

**Tentativas com e-mails não cadastrados (detecção de enumeração):**
```sql
SELECT ip_address, email, created_at
FROM audit_logs
WHERE event_type = 'OTP_REQUEST_UNKNOWN_EMAIL'
ORDER BY created_at DESC
LIMIT 50;
```

**Uploads de relatórios nos últimos 30 dias:**
```sql
SELECT email, (details->>'name') AS relatorio,
       (details->>'fileCount') AS arquivos,
       created_at
FROM audit_logs
WHERE event_type = 'REPORT_UPLOADED'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

**Relatórios deletados (rastreabilidade):**
```sql
SELECT email, (details->>'name') AS relatorio,
       (details->>'reportId') AS id, created_at
FROM audit_logs
WHERE event_type = 'REPORT_DELETED'
ORDER BY created_at DESC;
```

**Falhas de upload nas últimas 24h:**
```sql
SELECT email, ip_address,
       (details->>'name') AS tentativa,
       (details->>'error') AS motivo,
       created_at
FROM audit_logs
WHERE event_type = 'REPORT_UPLOAD_FAILED'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## Autenticação — como funciona

O sistema usa autenticação _passwordless_: o usuário informa o e-mail e recebe um código OTP de 7 dígitos. Não há senhas armazenadas.

```
Usuário              Frontend              Backend              Banco/Redis
   │  digita e-mail     │                    │                      │
   │──────────────────▶│  POST /request-otp │                      │
   │                    │──────────────────▶│  verifica e-mail     │
   │                    │                    │  define cooldown Redis│
   │                    │                    │  gera OTP, salva hash│
   │                    │                    │─────────────────────▶│
   │  código OTP chega  │                    │  envia e-mail        │
   │  no e-mail         │                    │                      │
   │  digita OTP        │  POST /verify-otp  │                      │
   │──────────────────▶│──────────────────▶│  SELECT FOR UPDATE   │
   │                    │                    │  valida hash + prazo │
   │                    │                    │  marca OTP como usado│
   │                    │                    │  cria sessão         │
   │                    │◀──────────────────│  Set-Cookie: HttpOnly│
   │  acesso liberado   │                    │                      │
```

---

## Segurança

### Autenticação e sessão

| Mecanismo | Detalhe |
|-----------|---------|
| OTP criptograficamente seguro | `crypto.randomInt()` do Node.js — não usa `Math.random()` |
| OTP nunca em texto claro | Armazenado como HMAC-SHA256 com `OTP_SECRET` |
| Verificação atômica | `SELECT FOR UPDATE` previne race condition em duas requisições simultâneas |
| OTP de uso único | Campo `used_at` preenchido após uso; tentativa de reutilização é rejeitada |
| Sessão via cookie HttpOnly | `HttpOnly` + `SameSite=Strict` — JS da página não acessa o token |
| Token de sessão com hash | Cookie contém token aleatório de 32 bytes; banco armazena apenas HMAC-SHA256 |
| Sem sessões simultâneas | Nova sessão invalida todas as anteriores do mesmo usuário |
| Sessão com expiração de 24h | Sem renovação automática — novo OTP obrigatório após expirar |
| Resposta genérica | E-mail inexistente retorna a mesma mensagem que e-mail válido (anti-enumeração) |
| Cooldown por e-mail | 3 minutos entre solicitações de OTP para o mesmo endereço (Redis TTL) |
| Rate limit por IP — request | 10 requests / 10 min; bloqueio de 15 min |
| Rate limit por IP — verificação | 10 tentativas / 5 min; bloqueio de 15 min |

### Upload e serving de relatórios

| Ameaça | Mitigação |
|--------|-----------|
| Path traversal no ZIP | Rejeita entradas com `..`, caminhos absolutos ou null bytes |
| ZIP bomb | Limite de 200 MB descomprimido; limite de 500 arquivos |
| Upload de executáveis | Whitelist de extensões; extensões fora da lista são rejeitadas |
| Symlinks maliciosos | Entradas do tipo link são rejeitadas |
| Path traversal no serving | Caminho resolvido validado contra `REPORTS_DIR/{uuid}` |
| Acesso sem autenticação | `authenticate` middleware em todos os endpoints de relatório |
| Relatório desativado | Endpoint de serving retorna 403 se `is_active = false` |
| MIME sniffing | `nosniff` + MIME type explícito via `mime-types` por arquivo |
| Scripts inline / eval bloqueados | CSP permissivo aplicado apenas nas rotas de serving de relatório |

### Headers HTTP

| Header | Valor | Proteção |
|--------|-------|----------|
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Content-Security-Policy` | `default-src 'self'` (app) / permissivo (relatórios) | XSS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Vazamento de URL |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Força HTTPS — ativo quando TLS está configurado |

---

## Configuração avançada

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `POSTGRES_DB` | `auth_db` | Nome do banco de dados |
| `POSTGRES_USER` | `auth_user` | Usuário do banco |
| `POSTGRES_PASSWORD` | — | Senha do banco (**trocar em produção**) |
| `OTP_SECRET` | — | Segredo HMAC do OTP (**trocar em produção**) |
| `SESSION_SECRET` | — | Segredo HMAC do token de sessão (**trocar em produção**) |
| `EMAIL_PROVIDER` | `smtp` | Provedor: `smtp` (MailHog/dev) ou `resend` (produção) |
| `EMAIL_FROM` | `noreply@auth.local` | Endereço remetente (domínio verificado no Resend em produção) |
| `EMAIL_FROM_NAME` | — | Nome exibido no campo "De:" — ex: `Portal Red Team` |
| `RESEND_API_KEY` | — | Chave da API Resend (obrigatório quando `EMAIL_PROVIDER=resend`) |
| `HTTP_PROXY` | — | Proxy de saída para chamadas do Resend (opcional) — ex: `http://192.168.15.4:8080` |
| `PROXY_INSECURE` | `false` | Desabilita verificação TLS no proxy — necessário quando o proxy intercepta HTTPS (ex: Burp Suite). **Apenas dev/teste.** |
| `SMTP_HOST` | `mailhog` | Host SMTP (usado quando `EMAIL_PROVIDER=smtp`) |
| `SMTP_PORT` | `1025` | Porta SMTP |
| `SMTP_SECURE` | `false` | TLS (`true` para porta 465) |
| `SMTP_USER` | — | Usuário SMTP (opcional) |
| `SMTP_PASS` | — | Senha SMTP (opcional) |
| `OTP_DURATION_SECONDS` | `300` | Validade do OTP (5 minutos) |
| `OTP_COOLDOWN_SECONDS` | `180` | Cooldown por e-mail (3 minutos) |
| `SESSION_DURATION_SECONDS` | `86400` | Duração da sessão (24 horas) |
| `OTP_REQUEST_IP_MAX` | `10` | Máximo de requests de OTP por IP |
| `OTP_REQUEST_IP_WINDOW_SECONDS` | `600` | Janela para o limite acima (10 minutos) |
| `OTP_VERIFY_IP_MAX` | `10` | Máximo de verificações de OTP por IP |
| `OTP_VERIFY_IP_WINDOW_SECONDS` | `300` | Janela para o limite acima (5 minutos) |
| `RATE_LIMIT_BLOCK_SECONDS` | `900` | Duração do bloqueio por IP (15 minutos) |
| `COOKIE_SECURE` | `false` | Habilita flag `Secure` no cookie de sessão — definir `true` ao usar HTTPS |
| `HTTP_PORT` | `80` | Porta do host mapeada para HTTP |
| `HTTPS_PORT` | `443` | Porta do host mapeada para HTTPS |
| `HTTPS_ENABLED` | `false` | Ativa o Nginx em modo HTTPS — exige `certs/cert.pem` e `certs/key.pem` |

### Gerar segredos seguros para produção

```bash
openssl rand -hex 32   # para OTP_SECRET
openssl rand -hex 32   # para SESSION_SECRET
```

### Configurar e-mail real

#### Opção 1 — Resend (recomendado para produção)

1. Crie uma conta em [resend.com](https://resend.com)
2. Gere uma API key em **API Keys**
3. Adicione e verifique seu domínio em **Domains** (SPF, DKIM e DMARC no DNS)
4. Configure o `.env`:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@seudominio.com
EMAIL_FROM_NAME=Portal Red Team
```

> Sem domínio verificado, use `onboarding@resend.dev` — apenas o e-mail dono da conta receberá mensagens (só para testes).

#### Proxy de saída para o Resend

O proxy é **opcional** — o backend consegue chegar em `api.resend.com` diretamente. Use quando quiser rotear o tráfego do Resend por um proxy (inspeção, auditoria ou restrição de rede).

O proxy é aplicado exclusivamente às chamadas do Resend. Conexões com PostgreSQL, Redis e SMTP usam TCP direto e não são afetadas.

**Cenário 1 — Proxy transparente** (Squid, nginx, corporativo):

```env
HTTP_PROXY=http://192.168.15.4:8080
```

O proxy repassa o túnel CONNECT sem interceptar o TLS — verificação de certificado permanece ativa.

**Cenário 2 — Proxy com inspeção TLS** (Burp Suite, mitmproxy — apenas dev/teste):

```env
HTTP_PROXY=http://192.168.15.4:8080
PROXY_INSECURE=true
```

O proxy apresenta seu próprio certificado no lugar do `api.resend.com` (MITM). `PROXY_INSECURE=true` desabilita a verificação TLS para aceitar esse certificado. **Não usar em produção.**

> Se o proxy exigir autenticação: `HTTP_PROXY=http://usuario:senha@host:porta`

#### Opção 2 — SMTP com Gmail

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu@gmail.com
SMTP_PASS=sua_senha_de_app
EMAIL_FROM=seu@gmail.com
```

> No Gmail, use uma [Senha de App](https://myaccount.google.com/apppasswords), não a senha da conta.

### Upload de relatórios

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `UPLOAD_RATE_MAX` | `20` | Uploads permitidos por usuário na janela de tempo |
| `UPLOAD_RATE_WINDOW_SECONDS` | `3600` | Janela do rate limit de upload (1 hora) |

---

## Portas e HTTPS

### Portas customizadas

Por padrão o sistema escuta nas portas padrão (80/HTTP e 443/HTTPS). Para usar outras portas, defina no `.env`:

```env
HTTP_PORT=8080
HTTPS_PORT=8443
```

E reinicie:

```bash
docker compose up -d
```

Não é necessário rebuild — a mudança de porta é apenas no mapeamento do Docker.

---

### HTTPS

O Nginx já está configurado para TLS. Basta fornecer os certificados e configurar o `.env`.

### Como funciona

- Porta `HTTP_PORT` redireciona automaticamente para `HTTPS_PORT` (`301 Moved Permanently`)
- TLS 1.2 e 1.3 apenas; cifras modernas (ECDHE/ChaCha20)
- HSTS habilitado (`max-age=31536000; includeSubDomains`) — após a primeira visita, o browser força HTTPS
- Certificados lidos de `./certs/cert.pem` e `./certs/key.pem` (montados como volume read-only no container)

### Escolha o tipo de certificado

| Cenário | Método | Alerta no browser |
|---------|--------|-------------------|
| LAN / IP interno | Self-signed (`openssl`) | Sim — clica em "Avançar" |
| Domínio interno / desenvolvimento | `mkcert` (CA local instalada) | Não |
| Produção com domínio público | Let's Encrypt (`certbot`) | Não |

---

### Opção 1 — Self-signed (LAN / IP)

Ideal para uso interno sem domínio. O browser exibirá alerta de segurança, mas o tráfego é criptografado.

```bash
mkdir -p certs

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out   certs/cert.pem \
  -subj  "/CN=192.168.15.4" \
  -addext "subjectAltName=IP:192.168.15.4"
```

> Substitua `192.168.15.4` pelo IP ou hostname real do servidor.

---

### Opção 2 — mkcert (domínio interno, sem alerta)

Cria uma CA local confiável. Instale a CA uma vez em cada máquina que vai acessar o sistema.

```bash
# Instalar mkcert (Ubuntu/Debian)
sudo apt install mkcert
mkcert -install   # instala a CA local no sistema e no browser

mkdir -p certs
mkcert -key-file certs/key.pem -cert-file certs/cert.pem \
  192.168.15.4 localhost 127.0.0.1
```

**Para outros dispositivos na rede confiarem no certificado**, copie e instale o arquivo da CA:

```bash
# Localizar o arquivo da CA gerado pelo mkcert
mkcert -CAROOT   # exibe o caminho — geralmente ~/.local/share/mkcert/

# Copiar rootCA.pem para os outros dispositivos e instalar:
# Linux: copiar para /usr/local/share/ca-certificates/ e rodar update-ca-certificates
# Windows: importar no Gerenciador de Certificados como "Autoridades de Certificação Raiz Confiáveis"
# macOS: arrastar para o Keychain Access e marcar como confiável
```

---

### Opção 3 — Let's Encrypt (domínio público)

Requer um domínio público apontando para o servidor.

```bash
sudo apt install certbot

# Parar temporariamente o sistema para liberar a porta 80
docker compose down

# Gerar o certificado
sudo certbot certonly --standalone -d seudominio.com

# Copiar para a pasta certs/
mkdir -p certs
sudo cp /etc/letsencrypt/live/seudominio.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/seudominio.com/privkey.pem   certs/key.pem
sudo chown $USER:$USER certs/*.pem
```

**Renovação automática** (Let's Encrypt expira em 90 dias):

```bash
# Adicionar ao cron — renova e copia os arquivos automaticamente
sudo crontab -e
# Adicionar a linha:
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/seudominio.com/fullchain.pem /caminho/projeto/certs/cert.pem && cp /etc/letsencrypt/live/seudominio.com/privkey.pem /caminho/projeto/certs/key.pem && docker compose -f /caminho/projeto/docker-compose.yml restart frontend
```

---

### Ativar e subir

Após gerar os certificados com qualquer uma das opções acima, siga os passos:

**1. Atualizar o `.env`:**

```env
HTTPS_ENABLED=true
HTTPS_PORT=443        # ou outra porta desejada
COOKIE_SECURE=true
```

**2. Subir (sem rebuild):**

```bash
docker compose up -d
```

**3. Verificar:**

```bash
# Testar redirect HTTP → HTTPS
curl -I http://localhost

# Testar HTTPS (--insecure apenas para self-signed)
curl -Ik https://localhost

# Inspecionar o certificado
openssl s_client -connect localhost:443 -brief
```

---

### Reverter para HTTP

```env
# No .env
HTTPS_ENABLED=false
COOKIE_SECURE=false
```

```bash
docker compose up -d
```

> **Importante:** com `HTTPS_ENABLED=true`, o Nginx exige os arquivos `certs/cert.pem` e `certs/key.pem` — sem eles o container não inicia.
