# Cravoe Vendor Scout

Vercel-ready restaurant lead finder for Cravoe.

## Features

- Google Places search by cuisine + Kolkata area
- 4.0+ rating filter
- Hidden-gem / Cravoe-fit scoring
- Visible phone number, Copy, Call and WhatsApp
- Google Maps, Website, Instagram, Facebook, Swiggy and Zomato quick research
- Local browser data is retained and explicitly importable to Supabase
- Lifecycle and research states, including retrievable rejected leads

## Local development

Use Node.js 20 LTS or 22 LTS with npm 10, then:

```sh
npm ci
npm run dev
```

Checks:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Required environment variables

| Variable | Purpose |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Google Places search and photo API |
| `INTERNAL_APP_PASSPHRASE` | Shared internal sign-in secret; set a long random value |
| `INTERNAL_SESSION_SECRET` | HMAC signing secret, at least 32 random bytes |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key; never expose to browser |

Do not commit `.env` files or secrets. Copy `.env.example` to `.env.local` for local development. Add the same server-side variables in the deployment environment.

## Supabase setup and local-data import

Vendor Scout persistence is isolated in `vendor_scout_*` tables/functions. It does **not** reuse or alter Cravoe's existing production `public.restaurants` or `vendor_prospects` records.

1. Create a Supabase project and configure the variables above.
2. Apply `supabase/migrations/20261003_000001_phase1_reliability.sql` using the Supabase SQL editor or CLI.
3. Start the app and sign in with the internal passphrase.
4. Use the app's explicit local-data import control. Import creates/merges database records and does not clear browser localStorage. Keep a browser backup until the imported records are checked.

The migration defines restaurants, brands, aliases, evidence, research runs, lifecycle history, notes, manual overrides, outreach events, import fingerprints, and rate-limit storage. Applying the SQL and verifying import against the actual project remains an operator step.

## Google Places

Enable **Places API (New)** for the key. Keep the key server-side and apply provider-side quota restrictions.

## Vertex Gemini independent research

The automatic restaurant research pass uses keyless Vertex AI authentication:

Vercel OIDC → Google Cloud Workload Identity Federation → service-account impersonation → Vertex AI Gemini.

Add these deployment environment variables:

- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION=global`
- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- optional `GEMINI_MODEL`

No Gemini API key is required when Vertex/OIDC is configured. Research uses Gemini with Google Search grounding and stores source links when returned by the provider.
