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


## Gemini independent research

For the automatic restaurant research pass, add these Vercel environment variables:

- `GEMINI_API_KEY` — server-side Gemini API key
- `GEMINI_MODEL` — optional; defaults through the app to current Flash fallbacks

The research route uses Gemini with Google Search grounding to investigate each top lead's Kolkata outlet footprint, chain size, Swiggy/Zomato presence, hidden-gem fit, confidence, evidence summary, and grounded source links. Keep the key server-side; never expose it through `NEXT_PUBLIC_*`.
