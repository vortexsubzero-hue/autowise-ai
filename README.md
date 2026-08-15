# AutoWise AI v3

AutoWise AI turns a VIN into a vehicle dashboard with NHTSA specifications, recall lookup, local garage saving, and a secure AI Mechanic.

## Project structure

```text
autowise-ai/
├── index.html
├── style.css
├── app.js
├── netlify.toml
├── netlify/
│   └── functions/
│       └── ai-mechanic.js
├── test/
│   └── ai-mechanic.test.js
├── .env.example
└── package.json
```

The browser calls `/.netlify/functions/ai-mechanic`. That serverless function reads `OPENAI_API_KEY` on Netlify and calls the OpenAI Responses API. The secret is never included in `index.html`, `app.js`, or any browser response.

## Deploy on Netlify

1. Create an OpenAI API key at <https://platform.openai.com/api-keys>.
2. In Netlify, open the **autowise-ai** project.
3. Go to **Project configuration → Environment variables**.
4. Add `OPENAI_API_KEY` and paste the key as its value. Use all deploy contexts.
5. Optionally add `OPENAI_MODEL` with the value `gpt-5-mini`.
6. Trigger a new production deploy after the environment variable is saved.

Netlify reads `netlify.toml` automatically. The publish directory is the repository root and the serverless function directory is `netlify/functions`.

## Local development

Requires Node.js 18 or newer.

```bash
npm install
copy .env.example .env
npm run dev
```

Replace the placeholder in `.env` with a real API key. Do not commit `.env`.

Open the local URL printed by Netlify CLI, normally <http://localhost:8888>. Opening `index.html` directly will show the static interface, but AI Mechanic requires `netlify dev` so the function route exists.

## Checks

```bash
npm run check
npm test
```

## Data sources and safety

- VIN decoding: NHTSA vPIC
- Recall campaigns: NHTSA Recalls API (year/make/model results; verify exact VIN eligibility at NHTSA.gov)
- AI guidance: OpenAI Responses API through the Netlify serverless function

AutoWise provides informational guidance, not a confirmed diagnosis. Safety-critical concerns should be inspected by a qualified automotive professional.
