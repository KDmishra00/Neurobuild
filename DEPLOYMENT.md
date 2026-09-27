# Module 5 — Full Deployment (Cloud Infrastructure Setup)

The goal of this module is to take NeuroBuild from a project running on `localhost`
to a **production-level platform** reachable globally over the Internet, with
persistent storage, HTTPS security, a custom domain, and automated deployments.

This guide is structured around the five deployment components:

- **A.** Backend hosting
- **B.** Database hosting
- **C.** Domain & DNS configuration
- **D.** SSL / HTTPS security
- **E.** CI/CD pipeline

---

## What "deployed" means for this app

NeuroBuild has **two deployable halves** and one runtime dependency:

| Piece | Technology | Notes |
|---|---|---|
| Frontend | React + Vite → `client/dist` | Compiled static SPA |
| Backend | Express (Node 22) → `server.js` | REST + SSE streaming API |
| Database | MongoDB | Atlas (cloud) preferred for prod |
| AI (optional) | Ollama (local) or cloud API | Local-only — see below |

The Dockerfile is **multi-stage**: it builds the React frontend and bundles it
inside the same image the Express server runs, so both halves deploy together as
one artifact (`server.js` serves `client/dist` automatically).

> **AI caveat.** Ollama runs on your local machine and **cannot** run on a shared
> serverless host. For production AI generation you must supply a cloud AI key
> (`CLOUD_API_KEY` + `CLOUD_API_URL`, e.g. OpenRouter or NVIDIA NIM). Downloading
> a container with a local model is only practical on AWS EC2 / a VPS / Docker.

---

## A. Backend Hosting

Choose **one** option. The files needed for each are already in this repo.

### Option 1 — Render (Recommended for the demo)
Long-running container, free tier, auto-deploys on push, supports SSE streaming.

1. Push this repo to GitHub (see Step C1 if not already pushed).
2. On Render: **New + → Blueprint** → connect your GitHub repo.
   Render reads `render.yaml` and creates the service automatically.
3. In the service **Environment** tab set these (Blueprint generates `JWT_SECRET`):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` (Blueprint sets it) |
   | `JWT_SECRET` | auto-generated |
   | `MONGODB_URI` | your Atlas URI (from Part B) |
   | `CLOUD_API_KEY` | OpenRouter / NVIDIA key |
   | `CLOUD_API_URL` | `https://openrouter.ai/api/v1/chat/completions` |
   | `OPENAI_API_KEY` | OpenAI direct API key (`sk-...`) |
   | `ASTRA_API_KEY` | Experiential Labs key for GPT-6 Astra (`xpl_...`) |
   | `ASTRA_API_URL` | `https://api.experientiallabs.ai/v1/chat/completions` |
   | `OLLAMA_URL` | leave empty (no local Ollama on Render) |
   | `ALLOWED_ORIGINS` | your `onrender.com` URL |

4. Render builds the Dockerfile and shows you `https://yourapp.onrender.com`.

### Option 2 — Railway
Same long-running model as Render (free trial credits).

1. `railway up` after logging in, or connect GitHub → **New Project → Deploy from repo**.
2. Railway detects the root `Dockerfile`.
3. Add the same environment variables as above in **Variables**.
4. Railway provisions a URL + SSL automatically.

### Option 3 — AWS EC2 (best for running your own Ollama instance)
A real VM where you *can* install and serve Ollama alongside the app.

```bash
# 1. Update & install Docker on the instance
sudo apt update && sudo apt install -y docker.io docker-compose-plugin

# 2. Clone the repo
git clone https://github.com/YOUR_USERNAME/pblpro.git && cd pblpro

# 3. Create .env with real secrets (MONGODB_URI, JWT_SECRET, CLOUD_API_KEY, ...)
cp .env.example .env
nano .env          # set production values

# 4. Build & run
docker compose up -d --build

# 5. Open the EC2 security group inbound port 3000 (or 80/443 via a proxy)
```

To serve Ollama: install it on the EC2 box and set `OLLAMA_URL=http://localhost:11434`
inside the container via `host.docker.internal` (already wired in
`docker-compose.yml`).

### Option 4 — Vercel (serverless — limited)
`vercel.json` is configured to build `client/dist` and expose `/api/*` as a
serverless function. **Limitations to know:**
- No local Ollama — cloud AI key required.
- Long-running SSE streams are degraded on serverless (function timeouts).
- Best used for the static site + CRUD API; for full streaming use Render/Railway/EC2.

```bash
npm i -g vercel
vercel        # first deploy
vercel --prod # production
```

---

## B. Database Hosting — MongoDB Atlas

Atlas gives you a managed, always-on database (free M0 tier = 512 MB).

1. Create an account at [mongodb.com/atlas](https://www.mongodb.com/atlas) → **Build a Database**.
2. Pick the **M0 Free** cluster, region close to your users.
3. **Database Access** → add a user + strong password (save it).
4. **Network Access** → **Add IP** → `0.0.0.0/0` (*Allow access from anywhere*)
   so cloud hosts can connect.
5. **Database → Connect → Drivers** and copy the URI, then add the DB name:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/neurobuild?retryWrites=true&w=majority
   ```
6. Set `MONGODB_URI` to this in your host's env vars. The health endpoint
   (`/api/health`) verifies connectivity (`"mongodb":"connected"`).

> Migration from local to Atlas is seamless — the app only reads `MONGODB_URI`.

---

## C. Domain & DNS Configuration

1. **Buy a domain** at any registrar (Namecheap / GoDaddy / Cloudflare / Google).
2. **Connect it to your host:**
   - **Render/Railway/Vercel**: in the dashboard, **Settings → Domains** → add the
     domain. The host shows the DNS records to create.
   - **AWS EC2**: point DNS to your Elastic IP with an **A record**.
3. **Configuring DNS records** (at your registrar):

   | Record | Name | Value |
   |---|---|---|
   | A | `@` (apex) | your host IP (EC2) or host-provided IP |
   | CNAME | `www` | `your-app.onrender.com` / `cname.vercel-dns.com` etc. |
4. **Update `ALLOWED_ORIGINS`** in your env to:
   ```
   https://your-domain.com,https://www.your-domain.com
   ```
5. DNS may take a few minutes to hours to propagate (check with
   https://dnschecker.org).

---

## D. SSL / HTTPS Security

SSL encrypts traffic between users and your app and prevents man-in-the-middle
attacks.

- **Render, Railway, Vercel** provision and **auto-renew** SSL certificates for
  free on all domains (default subdomains *and* custom domains). No manual work.
- **AWS EC2**: either
  - terminate TLS at an Application Load Balancer (ACM certificate) — recommended, or
  - run `certbot` (Let's Encrypt) on the instance.

**App-level hardenings already in place** (`server.js`):
- `helmet` (security headers + CSP)
- `enforceHttps` (redirects HTTP → HTTPS in production)
- CSRF for state-changing requests, auth/sanitize/rate-limit middleware.

Verify: open `https://your-domain/api/health` → padlock + `{"status":"ok"}`.

---

## E. CI/CD Pipeline

`.github/workflows/ci.yml` automates the whole flow on every push to `main`:

1. **Lint, Test & Build**:
   - Backend unit/logic tests (`npm run test:logic`)
   - Client lint (`npm run lint`)
   - Client type-check + production bundle (`npm run build`)
2. **Deploy** (only on pushes to `main`):

### Connect your host to CI

- **Render / Railway**: enable auto-deploy on the service — your push deploys it itself.
- **Vercel via GitHub Actions** (the configured `deploy` job) needs three repo
  secrets:

  ```
  Settings → Secrets and variables → Actions →
    VERCEL_TOKEN        ← token from vercel.com/account/tokens
    VERCEL_ORG_ID       ← from .vercel/project.json (run `vercel link`)
    VERCEL_PROJECT_ID   ← from .vercel/project.json
  ```

After wiring secrets, **`git push` → tests/build → auto-deploy → live variation**,
with bug fixes flowing the same automated path.

---

## Putting it together — recommended production stack

| Component | Recommended | Alternative |
|---|---|---|
| Backend | Render (Docker) | Railway, AWS EC2, Vercel |
| Frontend | Served by backend | Vercel static |
| Database | MongoDB Atlas (M0) | AWS RDS, Supabase |
| Domain | Namecheap/Cloudflare | any registrar |
| SSL | Auto (Render) | ACM / Let's Encrypt |
| CI/CD | GitHub Actions | Render auto-deploy |

### Environment variable checklist (production)

```ini
NODE_ENV=production
PORT=3000
JWT_SECRET=<64-hex-random>
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/neurobuild?retryWrites=true&w=majority
ALLOWED_ORIGINS=https://your-domain.com
CLOUD_API_KEY=<openrouter-or-nvidia-key>    # production AI (no Ollama on shared hosts)
CLOUD_API_URL=https://openrouter.ai/api/v1/chat/completions
```

Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Acceptance checklist

- [ ] `/api/health` returns `{"status":"ok","mongodb":"connected"}`
- [ ] `https://your-domain` serves the **React** app (dark-mode dashboard, not the demo)
- [ ] `ALLOWED_ORIGINS` matches your domain and login persists across tabs
- [ ] SSL padlock valid on all routes
- [ ] `git push` triggers CI → deploy automatically
- [ ] New-registration + save-project data survives a server restart (Atlas persistence)