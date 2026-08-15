# AutoWise AI v3.1

AutoWise turns a VIN into a vehicle dashboard with NHTSA specifications, recall research, saved vehicles, a maintenance planner, buyer and repair checklists, and a secure AI Mechanic.

## What's included

- NHTSA vPIC VIN decoding and year/make/model recall research
- OpenAI Responses API behind a Netlify serverless function
- No API key or beta-code list in browser files
- Native Netlify rate limit: 5 AI requests per IP and domain per minute
- Same-site origin checks, request validation, request IDs, timeouts, and safe error messages
- Optional beta access codes through `BETA_ACCESS_CODES`
- OpenAI `store: false` and a one-way hashed `safety_identifier`
- Saved vehicle, usage counter, and five recent analyses stored locally in the browser
- Copy, print, and Save as PDF actions
- Responsive, accessible interface with Privacy and Terms drafts
- Content Security Policy and other production security headers

## Project structure

```text
autowise-ai/
|-- index.html
|-- privacy.html
|-- terms.html
|-- style.css
|-- config.js
|-- app.js
|-- netlify.toml
|-- netlify/functions/ai-mechanic.js
|-- test/ai-mechanic.test.js
|-- .env.example
|-- package.json
|-- LAUNCH_CHECKLIST.md
|-- robots.txt
`-- sitemap.xml
```

The browser calls `/api/ai-mechanic`. Netlify maps that path to the serverless function, which reads the OpenAI secret and calls the Responses API. The VIN itself is not included in the AI prompt.

## Deploy on Netlify

1. Upload the complete project to the root of the linked GitHub repository.
2. In Netlify, open **Project configuration > Environment variables**.
3. Add `OPENAI_API_KEY` as a secret. The OpenAI API account needs a positive billing balance.
4. Optionally add `OPENAI_MODEL` with `gpt-5-mini`.
5. For a code-gated beta, add `BETA_ACCESS_CODES` with comma-separated codes, for example `ALPHA-7K2P,BETA-9M4Q`. Use unique, hard-to-guess codes and never commit them to GitHub.
6. If using a custom domain, add `ALLOWED_ORIGIN`, for example `https://www.example.com`.
7. Trigger a new production deploy after changing environment variables.

Netlify automatically supplies its own production URL. `netlify.toml` publishes the repository root and deploys `netlify/functions`.

## Optional checkout link

Checkout is deliberately disabled until the operator creates and verifies a real payment offer.

1. Create a one-time Payment Link with a payment provider such as Stripe.
2. Publish seller identity, support contact, included usage, delivery method, and refund terms.
3. In `config.js`, put the verified `https://buy.stripe.com/...` URL in `betaCheckoutUrl`.
4. Change the displayed `betaPrice` only if it exactly matches checkout.
5. Redeploy and complete a real low-value end-to-end test before sharing the link.

This release does **not** automatically create or deliver access codes, decrement purchased credits, verify webhooks, or maintain customer accounts. For a handful of founding users, the operator can manually assign one code per buyer. Before scaling, add authenticated users, a database-backed credit ledger, signed payment webhooks, automated delivery, refunds, and support workflows.

## Local development

Requires Node.js 18 or newer.

```bash
npm install
copy .env.example .env
npm run dev
```

Replace placeholder values in `.env`. Never commit `.env`. Open the local URL printed by Netlify CLI, normally `http://localhost:8888`.

## Checks

```bash
npm run check
npm test
```

Tests cover routing, native rate-limit configuration, API-key protection, origin checks, beta access codes, validation, OpenAI privacy fields, successful output, and insufficient-credit errors.

## Data sources and safety

- VIN decoding: NHTSA vPIC
- Recall campaigns: NHTSA Recalls API; confirm exact VIN eligibility at NHTSA.gov
- AI guidance: OpenAI Responses API through Netlify

AutoWise provides informational guidance, not a confirmed diagnosis. Safety-critical concerns should be inspected by a qualified automotive professional. `privacy.html` and `terms.html` are careful launch drafts, not a substitute for legal review.
