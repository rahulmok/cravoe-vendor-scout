# Bengal Stay Scout

Live discovery at /hotels uses Places API (New) Text Search, one town at a time across 12 regional clusters. There are no bundled hotel records. Every result is deduplicated by Google Place ID; state/country/locality/types and closure status are checked before display. Search returns one page per town per pass and retains nextPageToken cursors for additional passes. Refresh Maps restarts a pass. Maps does not guarantee exhaustive coverage.

Maps results appear immediately. Automatic Gemini research checks every discovered property in batches of four, preserving Maps identity, address, rating and photos. Matched properties receive sourced classification, socials, contact routes, creator disclosures and pitch ideas. Missing or failed research remains visible and can be retried. Hotel star categories are distinct from guest ratings. A normal phone number is never assumed to be WhatsApp. Historical creator evidence does not establish present availability or budget.

Legacy preloaded results are removed from Discover. Existing manual pipeline/notes are preserved; old backups can still be imported. Local storage version 2 retains Maps discoveries, pipeline, notes, follow-ups, profile and coverage cursors in this browser. JSON backups transfer work across devices. CSV exports filtered results. Outreach is user initiated.

Uses the existing GOOGLE_PLACES_API_KEY and Vertex OIDC Gemini configuration on Vercel. The API key stays server side. The original restaurant scout is untouched.
