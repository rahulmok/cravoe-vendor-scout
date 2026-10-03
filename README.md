# Cravoe Vendor Scout

Vercel-ready restaurant lead finder for Cravoe.

- Google Places search by cuisine + Kolkata area
- 4.0+ rating filter
- Hidden-gem / Cravoe-fit scoring
- Visible phone number, Copy, Call and WhatsApp
- Google Maps, Website, Instagram, Facebook, Swiggy and Zomato quick research
- Shortlist and reject state saved in-browser

## Vercel
Import this repository and add the environment variable:

`GOOGLE_PLACES_API_KEY`

Enable **Places API (New)** for the key.


## Vertex Gemini independent research

The automatic restaurant research pass uses the same keyless Vertex AI authentication pattern as the Cravoe Agent:

Vercel OIDC → Google Cloud Workload Identity Federation → service-account impersonation → Vertex AI Gemini.

Add these Vercel environment variables:

- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION=global`
- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- optional `GEMINI_MODEL`

No Gemini API key is required when Vertex/OIDC is configured. The research route uses Gemini with Google Search grounding to investigate each top lead's Kolkata outlet footprint, chain size, Swiggy/Zomato presence, hidden-gem fit, confidence, evidence summary, and grounded source links.
