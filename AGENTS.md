# AGENTS.md

## Cursor Cloud specific instructions

Med System is a single product split into three Node.js services in one repo: `backend` (Express 5 REST API, port `4000`), `frontend` (React 19 + Vite SPA, dev port `5173`), and the optional `whatsapp-worker` (port `8080`). MongoDB is the datastore. Minimum to run the product end-to-end locally: MongoDB + `backend` + `frontend`. All external integrations (SMTP, Google Calendar, WhatsApp) are optional and have safe defaults, so no secrets are required for local development.

### Services and how to run them
- Standard commands live in the `scripts` of the root `package.json`, `backend/package.json`, and `frontend/package.json` (e.g. `npm run dev --prefix backend`, `npm run dev:frontend`, `npm test`, `npm run build`). Refer to those instead of duplicating here.
- MongoDB is installed system-wide but there is no systemd in this environment, so start it manually before the backend: `mongod --dbpath ~/data/db --bind_ip 127.0.0.1 --port 27017` (create `~/data/db` first). The backend exits on startup if Mongo is unreachable.
- The backend reads config from `backend/src/config/env.js`, which provides working dev defaults (Mongo URI `mongodb://localhost:27017/med-system`, JWT secret, frontend origin). A `.env` file is NOT required for local dev despite the README's `cp .env.example .env` step — `.env.example` does not exist in the repo.
- The frontend talks to the API via `VITE_API_URL` (defaults to `http://localhost:4000/api`).
- CORS on the backend only allows the exact `FRONTEND_ORIGIN` (default `http://localhost:5173`). When testing through a browser, hit the frontend on `http://localhost:5173` so requests originate from the allowed origin.

### Testing / lint / build caveats
- Tests use Vitest and do NOT need MongoDB: `backend/src/app.test.js` builds the app without a DB connection, and `frontend/src/App.test.jsx` renders the login screen.
- `npm run lint --prefix backend` currently FAILS: the `lint` script runs ESLint 10 but the repo has no `eslint.config.js`. This is a pre-existing repo gap, not an environment problem; do not treat it as a setup regression.
- The frontend has no `lint` script; only `dev`, `build`, `preview`, `test`.

### Hello-world flow
First access creates a user (register), then log in. Core flow: register/login → cadastrar locais → procedimentos → pacientes → agendamentos → evolução/receita. The API exposes `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/patients` (JWT bearer required for patients).
