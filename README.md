# Neurobuild

Neurobuild is a prompt-to-website builder. A user can create an account, describe a site, generate it with a local Ollama model or compatible cloud model, preview it in a sandbox, edit its HTML/CSS/JavaScript, refine it with AI, save projects, revisit them, and download a self-contained website.

## What is included

- Email/password accounts with secure password hashing and JWT sessions
- Prompt-to-site generation, model chooser, caching, rate limiting, and a two-stage or parallel AI pipeline
- Responsive desktop/tablet/mobile preview, safe iframe isolation, editable source, copy, open, and ZIP export
- Templates, prompt history, profile and generation settings
- Server-backed projects with automatic saved versions, account-level listing, load, save, and clear
- Account deletion that also removes the user's saved projects

## Run locally

1. Install Node.js 20+ and MongoDB 7+, then start MongoDB.
2. Install Ollama, start it, and pull a model such as `ollama pull gemma:latest`.
3. Copy `.env.example` to `.env`, set a unique `JWT_SECRET`, and adjust `MONGODB_URI` or model settings if required.
4. Run `npm install`, then `npm run dev`.
5. Open [http://localhost:3000](http://localhost:3000), create an account, and generate your first site.

## Run with Docker

1. Copy `.env.example` to `.env` and set a unique `JWT_SECRET`.
2. Keep Ollama running on your host, or set `OLLAMA_URL` to a reachable model server.
3. Run `docker compose up --build` and open [http://localhost:3000](http://localhost:3000).

On macOS and Windows the included `host.docker.internal` setting reaches host Ollama. On Linux it is mapped through Docker's `host-gateway` feature.

## Cloud models

For OpenRouter-compatible generation, set `CLOUD_API_KEY` and optionally `CLOUD_API_URL`. Then select one of the OpenRouter-labelled models in the product. Never expose that key in browser code or commit `.env`.

## Production checklist

- Set `NODE_ENV=production`, a long random `JWT_SECRET`, `MONGODB_URI`, and `ALLOWED_ORIGINS` to your public HTTPS domain.
- Put the app behind HTTPS and a reverse proxy that supports streaming responses.
- Configure a paid model provider or a suitable dedicated Ollama server; public traffic consumes model capacity and may create cost.
- Add email verification, password reset, billing/usage quotas, and object storage before an open public launch.

## Verification

Run `npm test` to syntax-check all server-side routes and the browser API helper.
