# Med System - Sistema de Atendimento de Consultorio

Sistema completo para atendimento clinico com backend Node.js + MongoDB e frontend React mobile-first.

## Funcionalidades implementadas

- Backend Node + MongoDB
- Frontend React mobile-first
- Autenticacao JWT (login, registro, perfil)
- Camadas de seguranca (helmet, rate limit, sanitizacao, auditoria)
- Cadastro de pacientes com campos clinicos
- Cadastro de multiplos enderecos com valores de consulta
- Cadastro de multiplos procedimentos (consulta, endoscopia, colonoscopia, cirurgia etc.)
- Agenda com validacao de conflito e valores por endereco/procedimento
- Atendimento do paciente (evolucao), insercao de exames e emissao de receita em PDF
- Envio de receita por e-mail
- Relatorios de atendimento
- Integracao Google Agenda (OAuth + criacao de eventos)
- Notificacoes por WhatsApp
- Integracao WhatsApp Business API
- Integracao WhatsApp Web com QR Code para escanear

## Compliance HIPAA/LGPD

Este projeto implementa controles tecnicos de base:

- Registro de auditoria de requisicoes e acoes
- Criptografia de notas sensiveis do paciente em repouso
- Controle de acesso por papeis
- Hardening HTTP e limitacao de taxa

> Importante: compliance completo HIPAA/LGPD depende tambem de processos, politicas internas, backups, contratos, controle de acesso operacional e monitoramento continuo.

## Requisitos

- Node 22+
- Docker (opcional)

## Subir com Docker (recomendado)

1. Copie `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
2. Suba os servicos:
   ```bash
   docker compose up
   ```
3. Acesse:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:4000/health

## Subir local sem Docker

### Backend
```bash
cd backend
npm install
cp ../.env.example ../.env
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Testes

```bash
# raiz
npm test

# ou separado
cd backend && npm test
cd frontend && npm test
```

## Fluxo rapido de uso

1. Abra o frontend e crie seu usuario no primeiro acesso.
2. Cadastre locais (enderecos e valores).
3. Cadastre procedimentos.
4. Cadastre pacientes.
5. Crie agendamentos.
6. Registre evolucao, exames e emita receita.
7. Gere relatorios.
8. Configure integracoes Google e WhatsApp na tela Integracoes.

## Integracoes externas

### Google Agenda
- Preencha `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` no `.env`.
- Use endpoint/tela de integracoes para obter URL OAuth e trocar code por token.

### WhatsApp Business
- Defina:
  - `WHATSAPP_MODE=business`
  - `WHATSAPP_BUSINESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`

### WhatsApp Web (QR)
- Defina `WHATSAPP_MODE=web`.
- Abra Integracoes > Gerar QR Code e escaneie com WhatsApp Business/App.

## SMTP Gmail

Configure no `.env`:

```env
SMTP_PROVIDER=gmail
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-app-password-do-gmail
SMTP_FROM=seu-email@gmail.com
```

> Use **App Password** do Google (conta com 2FA), nao senha comum.

## Deploy free tier no Google Cloud (Cloud Run)

Foi adicionado workflow em:

`/.github/workflows/deploy-gcp-cloud-run.yml`

Ele faz:
1. Build da imagem Docker do backend
2. Push para Artifact Registry
3. Deploy no Cloud Run
4. Injeta variaveis de ambiente (incluindo WhatsApp web e SMTP Gmail)

### Secrets do GitHub necessarias

No repositório GitHub, configure:

- `GCP_PROJECT_ID` (ex.: `meu-projeto-123`)
- `GCP_REGION` (ex.: `us-central1`)
- `GCP_ARTIFACT_REPO` (ex.: `med-system`)
- `GCP_SERVICE_NAME` (ex.: `med-system-api`)
- `GCP_SA_KEY` (JSON completo da service account)
- `MONGODB_URI` (Mongo Atlas free tier)
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `FRONTEND_ORIGIN`
- `SMTP_USER`
- `SMTP_PASS` (App Password do Gmail)
- `SMTP_FROM`
- `WHATSAPP_WORKER_URL` (URL publica do servico dedicado do WhatsApp worker)
- `WHATSAPP_WORKER_TOKEN` (token compartilhado entre backend e worker)

### Variaveis ajustaveis no workflow

No arquivo de workflow (lidas via GitHub Secrets):

- `GCP_REGION`
- `GCP_SERVICE_NAME`
- `GCP_ARTIFACT_REPO`

### Como disparar deploy

Push para branch `main` ou execucao manual em **Actions > Deploy Backend to Cloud Run (Free Tier Friendly)**.

### Observacoes importantes para WhatsApp Web no Cloud Run

- Sessao WhatsApp Web e QR sao **estadoful** e podem ser instaveis em ambiente serverless.
- Para manter sessao de forma robusta, o ideal e persistir auth em storage externo e usar instancia sempre ativa (pode sair do free tier).
- Mesmo assim, o modo `web` foi mantido como solicitado e habilitado por variavel (`WHATSAPP_MODE=web`).

## Deploy do WhatsApp Worker dedicado (Cloud Run)

Foi adicionado workflow em:

`/.github/workflows/deploy-whatsapp-worker-cloud-run.yml`

Esse servico e separado do backend e mantem a sessao WhatsApp Web no proprio worker.
Para estabilidade do WhatsApp Web no Cloud Run, o deploy do worker usa:

- `min-instances=1`
- `max-instances=1`
- `concurrency=1`
- `cpu=2`
- `memory=2Gi`
- `--no-cpu-throttling` (CPU sempre alocada)

### Secrets do GitHub para worker

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_ARTIFACT_REPO`
- `GCP_WHATSAPP_WORKER_SERVICE_NAME` (ex.: `med-system-whatsapp-worker`)
- `GCP_SA_KEY`
- `WHATSAPP_WORKER_TOKEN` (token compartilhado com o backend)

### Configuracao no backend para usar o worker

No deploy do backend, configure:

- `WHATSAPP_WORKER_URL=https://<url-do-worker>`
- `WHATSAPP_WORKER_TOKEN=<mesmo-token-do-worker>`

Quando `WHATSAPP_WORKER_URL` estiver definido, as rotas de integracao WhatsApp do backend passam a atuar como proxy para o worker dedicado.

## Deploy do frontend no Cloud Run

Foi adicionado workflow em:

`/.github/workflows/deploy-frontend-cloud-run.yml`

Ele faz:
1. Build da imagem Docker do frontend
2. Push para Artifact Registry
3. Deploy do frontend no Cloud Run
4. Build do frontend com `VITE_API_URL` apontando para o backend

### Secrets do GitHub para frontend

- `GCP_PROJECT_ID`
- `GCP_REGION` (ex.: `us-central1`)
- `GCP_ARTIFACT_REPO` (ex.: `med-system`)
- `GCP_FRONTEND_SERVICE_NAME` (ex.: `med-system-web`)
- `GCP_SA_KEY`
- `FRONTEND_API_URL` (ex.: `https://med-api.stohler.com.br/api`)

### Dominios personalizados solicitados

- Frontend: `med.stohler.com.br`
- Backend API: `med-api.stohler.com.br`

No Cloud Run:
1. Abra o servico backend e frontend
2. Em cada servico, acesse **Manage custom domains**
3. Adicione os dominios acima
4. No painel DNS do seu provedor, crie os registros solicitados pelo Google (normalmente `CNAME`/`A` com verification)
5. Aguarde emissao SSL gerenciada pelo Google

