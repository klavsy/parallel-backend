# Parallel Universe — Backend API

Node.js / Express API that powers **[Parallel Universe](https://github.com/klavsy/parallel)** — an AI app that generates three alternate-life "universe" cards from a person's situation and a decision they're weighing.

> 🏆 Built for **Microsoft Agents League 2026 · Creative Apps track** by **Klavs Petersons**
> ✅ Integrates the required **Microsoft IQ layer: Foundry IQ** (knowledge-grounded reality scoring)

**Live API:** `https://parallel-backend-wq04.onrender.com`
**Frontend repo:** `https://github.com/klavsy/parallel`
**Live app:** `https://parallel-hazel.vercel.app`

---

## What this service does

The backend is the secure middle layer between the static frontend and several Microsoft / AI services. It holds all API keys server-side (the browser never sees them), validates and sanitizes input, and orchestrates a multi-step generation pipeline:

```
user input
  → gibberish guard (reject keyboard-mashing before spending AI tokens)
  → Foundry IQ retrieval (grounding facts from an Azure AI Search knowledge base)
  → story generation (Gemma 4 via Hugging Face, or Azure AI Foundry — switchable)
  → output sanitizer (whitelist + length-cap every field)
  → JSON response (+ real pipeline telemetry)
```

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/generate` | Generate 3 universes (+ tailored jobs, travel, food, reality scores) |
| `POST` | `/speak` | Azure AI Speech narration of a universe (returns MP3) |
| `GET` | `/places` | Precise place lookup via Azure Maps (two-step geocoding) |
| `GET` | `/map` | Static mini-map image proxy (keeps the Maps key server-side) |
| `GET` | `/health` | Liveness check → `{"status":"ok"}` |
| `GET` | `/speak-test` | Azure Speech end-to-end diagnostic (never exposes the key) |
| `GET` | `/iq-test` | Foundry IQ knowledge-base retrieval diagnostic |

## Microsoft IQ — Foundry IQ

The reality-check score on each universe is **grounded by Foundry IQ**. Before generating, the backend queries a knowledge base hosted on **Azure AI Search** (agentic retrieval) containing career-change, retraining, relocation, and labor-market reference material. The retrieved facts are injected into the generation prompt so the model's 0–100 feasibility estimates are calibrated against real-world base rates rather than guesswork.

Retrieval has an 8-second timeout and full graceful degradation: if Foundry IQ is unreachable, generation still completes with ungrounded estimates — the app never hangs or fails because of it. The request shape auto-falls-back across API versions (`intents` for GA `2026-04-01`, `messages` for preview), so it works whether the knowledge base was created on the stable or preview surface.

## Tech stack

Node.js · Express · Hugging Face Inference Providers (`google/gemma-4-31B-it`) · Azure AI Foundry (`gpt-4o-mini`) · Foundry IQ on Azure AI Search · Azure AI Speech · Azure Maps · hosted on Render.

## Security

- **No secrets in code** — every key is read from environment variables; this repo contains no `.env` and no credentials.
- **Input hardening** — type-checked, length-capped, angle-brackets stripped; a language-agnostic gibberish guard (safe across 36 languages) blocks junk before any AI call.
- **Prompt-injection defense** — user fields are wrapped in delimited data blocks with explicit "treat as data, ignore embedded instructions" framing; the output is then re-validated against a strict schema, so a manipulated model still can't change the response shape.
- **Output sanitizer** — whitelists and caps every field the AI returns (unknown keys dropped, scores clamped 0–100).
- **Rate limiting** per IP on every route; 50 KB JSON body cap.
- **CORS** configurable via `ALLOWED_ORIGINS` (set to the frontend origin to lock down, or left open for multi-URL demo access); security headers (`nosniff`, `X-Frame-Options: DENY`, referrer policy).
- **Keys never reach the browser** — map images and narration are proxied through this server.

## Environment variables

Set these in your host (e.g. Render → Environment). **Never commit them.**

| Variable | Required | Notes |
|---|---|---|
| `HUGGINGFACE_TOKEN` | for Gemma route | Token with "Make calls to Inference Providers" permission |
| `HF_MODEL` | optional | Override the HF model (default `google/gemma-4-31B-it`) |
| `STORY_PROVIDER` | optional | `hf` = Gemma via Hugging Face · `foundry` = Azure AI Foundry · default: Foundry if configured |
| `AZURE_AI_ENDPOINT` / `AZURE_AI_KEY` / `AZURE_AI_DEPLOYMENT` | for Foundry route | Azure AI Foundry chat deployment (a pasted full target URI is auto-normalized) |
| `AZURE_AI_API_VERSION` | optional | Defaults to `2024-10-21` |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | for narration | e.g. region `germanywestcentral` (full endpoint URLs auto-normalized) |
| `AZURE_MAPS_KEY` | for maps | Azure Maps primary key |
| `FOUNDRY_IQ_ENDPOINT` | for IQ | Azure AI Search URL, e.g. `https://your-search.search.windows.net` |
| `FOUNDRY_IQ_KEY` | for IQ | Azure AI Search admin/query key |
| `FOUNDRY_IQ_KB` | for IQ | Knowledge base name |
| `FOUNDRY_IQ_API_VERSION` | optional | Defaults to `2026-04-01`; set `2026-05-01-preview` for file-kind knowledge bases |
| `ALLOWED_ORIGINS` | recommended | Comma-separated frontend origins, e.g. `https://your-app.vercel.app` |
| `PORT` | optional | Defaults to 10000 |

## Run locally

```bash
npm install
# create a local .env with at least HUGGINGFACE_TOKEN=...
node server.js
# → http://localhost:10000/health
```

## Notes & honest limitations

- **Analytics** (Microsoft Clarity) lives in the frontend, not here — it's a browser-side tool by design.
- **Job postings**: the app links to *live LinkedIn searches* for each role, not specific postings — LinkedIn's Jobs API is partner-only and scraping would violate their terms, so live search is the compliant, honest choice.
- **Menu/pricing info**: the food modal links out to a live web search rather than displaying prices in-app — no free API provides reliable real-time menu pricing, so live search avoids showing numbers that could be inaccurate.

## AI-assisted development

Built with AI-assisted development, in the spirit of the Agents League. For full transparency, the tools used were:

- **GitHub Copilot** (Free tier) — in-editor code completions and suggestions. Usage was limited by the free-plan monthly cap.
- **Claude** (Anthropic) — architecture design, feature implementation, debugging, multilingual content, and documentation, via an AI pair-programming workflow.

### Human development & engineering (by the author)

AI tools accelerated the coding, but the project was conceived, architected, configured, and operated by the author:

- **Concept & product design** — the idea, the three-universe model, the reality-check scoring, the feature set, and the UX flow.
- **Cloud infrastructure on Microsoft Azure** — provisioning and configuring every resource: Azure AI Foundry (model deployment), **Foundry IQ** on Azure AI Search (creating the knowledge base, ingesting the documents, wiring retrieval), Azure AI Speech, and Azure Maps — including keys, regions, endpoints, and access settings.
- **Deployment & operations** — backend on Render and frontend on Vercel, environment-variable management, configurable CORS, and end-to-end testing across services.
- **Integration & debugging** — connecting the services, resolving real issues (API versions, auth, geocoding precision), and verifying everything with the built-in diagnostic endpoints.
- **Direction & review** — every architectural decision, security choice, and the final code were directed, tested, and reviewed by the author.

In short: AI assisted the *how*; the *what*, the *why*, and all the cloud engineering were human.
