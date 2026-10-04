# Bengal Stay Scout v3

Scoped `/hotels` rebuild. Restaurant route and restaurant research code are untouched.

## Discovery and scope
21 eligible districts (official 23-district directory minus Kolkata and Purulia), each with a district-wide query and named town searches. Maps results are actual live Places records, with Place ID identity, coordinates, country/state checks, business status and name filters. Purulia and Sundarbans destinations are excluded by address/locality names and a conservative core-area coordinate check. Kolkata city hotels are excluded by urban-core bounding box; outskirts leisure resorts may qualify. Boundaries are conservative approximations, not cadastral polygons. Pagination cursors, exclusions and failed towns are visible. No exhaustive hotel-coverage claim.

## Durable agent
Vercel Workflow SDK orchestrates independent persisted Maps, creator discovery, classification and Instagram/Facebook/YouTube steps. Job start responds immediately; progress is stored in Workflow streams. A signed run token authorizes reads and cancellation. Clients poll bounded snapshots and reconnect after refresh; browser closure does not stop jobs. Per-step retry is bounded to one retry. A discovery pass researches up to 20 priority hotels; remaining Maps candidates stay available for further 20-property research runs. Completed steps are reused by durable replay; new explicit refreshes run fresh research.

Creator-led discovery finds public social property hints and matches them to live Maps before individual research. All 21 districts are searched when selected. Creator discovery is not a guarantee that every social post or hotel can be found.

## Evidence and qualification
Google grounding redirects are resolved to exact destination URLs before extraction. Gemini 3.8 Flash uses LOW thinking; research requests ask for at most four focused queries, a prompt bound rather than an enforced tool limit. Grounded Gemini evidence reports are converted to schema-constrained JSON in a separate non-search call, preventing search citation formatting from corrupting JSON. Official websites are read directly with public-HTTPS/DNS/redirect guards and response-size limits; socials, mailto and WhatsApp links are extracted before research. Category needs an actual 3/4/5-star statement and exact source, distinct from guest rating. Quality uses recent/relevant Maps review samples and public sources; good requires a supporting source and date within a year. Unknown recent quality is visibly flagged; recurring concerns block the main shortlist. The small Maps review sample is not all reviews.

YouTube grounded video URLs also undergo direct public oEmbed metadata checks. A title must contain the distinctive property name and destination; brand-owned channels are excluded conservatively. This fallback verifies video title/channel, not dates, audience, or sponsorship. Only concrete public Instagram, Facebook and YouTube posts/videos count as creator evidence. Hotel-owned uploads are excluded by research instructions; creator identities are sourced public names/keys. Same identity across platforms counts once; alias matching remains dependent on public evidence and may need review. Explicit disclosures determine paid/hosted evidence. Multiple creators indicate likely promotional activity, not proof of sponsorship. Date recency is bounded; future/invalid dates do not affect ranking.

Ranking is lexicographic: eligibility, disclosed multiple-creator tier, multiple creator tier, single collaboration signal, single travel coverage, no evidence. Within tiers use unique creators, recent creators, reachable contact and quality evidence. Review-only candidates never outrank qualifying stays. Possible campaign clusters require 3+ unique creators within 45 days.

## Workspace and UI
User-selected dark luxury, code-first build. Large two-column property photos; one-column mobile; full-width gallery and full-page evidence/approach detail. Photos use actual Places resources at up to 1600px and display author attribution. No synthetic lead photos.

IndexedDB stores the browser workspace, including legacy v1/v2 migration, CRM notes/stages/follow-ups, creator profile, coverage and run tokens. Research jobs/results persist in Vercel Workflow; a JSON backup transfers the workspace/run links across devices. There is no account-based cross-device CRM sync. CSV escapes formula prefixes. Outreach drafts are editable and user initiated; nothing is sent automatically.
