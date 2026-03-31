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

