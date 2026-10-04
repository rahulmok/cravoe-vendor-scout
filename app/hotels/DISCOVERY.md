# Bengal Stay Scout — coordinate discovery v5

## Deployed architecture

The hotel inventory uses its own Supabase project, **Bengal Stay Scout** (`ajtqjurbpkhurjsehbda`, Mumbai). It shares no tables, credentials, CRM records or authentication with the Cravoe database. The existing Next.js/Vercel project still hosts the hotel and restaurant UIs.

| Implementation | Responsibility |
|---|---|
| `app/api/hotel-jobs/route.js` | Authenticated discovery/research start, reconnect and cancellation |
| `app/api/hotel-discover/route.js` | Discovery API alias; locality crawling retired |
| `workflows/hotel-grid-scout.js` | Durable baseline barrier, cell claims, six concurrent Google requests, checkpoint/retry/split decisions |
| `lib/hotel-geo.js` | Contiguous 1 km search-radius grid, circumscribed circles, quad splitting, distance and polygon tests |
| `lib/hotel-boundaries.js` / `lib/geo/` | Pinned geographic areas and coordinate exclusion masks |
| `lib/hotel-overpass.js` | Tagged node/way/relation accommodations, raw OSM tags and available geometries |
| `lib/hotel-grid-places.js` | Nearby Search (New) and five rectangle-restricted keyword variants |
| `lib/hotel-identity.js` | Unicode name normalization, Jaro–Winkler, 75 m identity matching and provenance merge |
| `supabase/migrations/` | Inventory, source aliases, leased queue, transactional checkpoints, CRM and shared job handles |
| `supabase/functions/hotel-store/` | Service-only database gateway with SHA-256 authenticated worker credential |
| `app/api/hotel-inventory/route.js` | Global search, server pagination, legacy import, CRM field patches and research queue |
| `lib/hotel-agent.js` | Official/OTA category evidence, quality review and targeted platform evidence |

## Discovery and completeness

1. A durable run seeds OSM macro-tiles and Google micro-cells using pinned coordinate boundaries, not geocoded towns or gram panchayats. Whole-state selection traverses every eligible district polygon; the coastal corridor is also available separately.
2. All selected OSM baseline tiles must finish before Google cells can be claimed. The Overpass expression uses `nwr["tourism"~"^(hotel|resort|guest_house|camp_site)$"]` and `out tags center geom`. Timeout/incomplete responses remain unresolved and can subdivide. Large baseline results subdivide before the database batch ceiling.
3. Google Nearby uses valid types `hotel`, `resort_hotel`, `lodging`, `bed_and_breakfast`, `guest_house`. **`resort` is not a valid type. Nearby has no text query or pagination.** Hotel/resort/luxury stay/eco stay/nature camp are separate Text Search requests restricted to the same rectangle. Every real Text Search page is checkpointed.
4. Root squares fit within overlapping approximately 1 km circles; edges and corners have no geometric search holes. Actual point ownership is clipped to each cell. Saturation is tested on raw API results before any exclusion filtering.
5. Any Google response of 20 results splits into four. Safety limits are depth 10 / radius 25 m. A cell still saturated at that limit is **blocked and pending**, never completed. Repeated pagination tokens are likewise unresolved.
6. Candidates inside an exclusion mask stay in inventory with an explanation, but never enter paid detail/category/social enrichment. OSM-only rows remain Needs review until sourced qualification.
7. `FOR UPDATE SKIP LOCKED` provides exclusive claims, with five-minute leases. Candidate writes, source identity resolution and traversal progress commit in one transaction. Replayed checkpoints return their original result. Source matching is serialized to prevent overlapping workers inserting twins.
8. A run cannot be completed while any pending/in-progress/blocked descendant exists. Failed API cells back off and become visibly blocked after six failures. Users can resume unresolved cells without repeating successful cells.

**Completing traversal is not proof of discovering every physical accommodation.** OSM only contains mapped features with matching tags; a tagged node may have no footprint. Ways/relations have geometry only where mapped. Google rankings and indexing can omit a business even when fewer than 20 rows return. No known property names are seeded or special-cased.

## Identity and data

Primary matching uses Google place ID, then OSM identity/source aliases. Fuzzy matching requires distance <=75 m and normalized Jaro–Winkler similarity >0.82. Unnamed features cannot fuzzy-merge. The SQL implementation uses the same threshold and distance formula as the JavaScript implementation.

`hotels.place_id` is the requested primary key. OSM-only records reserve `osm:type:id` until a Google ID is matched. An additional immutable UUID backs UI and CRM identity, so promoting an OSM identity does not lose notes. Source aliases preserve alternate Google IDs and OSM footprints. Research survives rediscovery; outreach fields are patched independently and never replaced by a full browser snapshot.

IndexedDB is now a read-only legacy import source. Import chunks have deterministic hashes and are idempotent; existing shared notes win over old backups. Successful import does not delete the old browser copy. Lead pagination and global search use the shared database. A nonempty global query deliberately bypasses active status, district, saved and creator filters, and returns Qualified, Needs review and Excluded rows with badges and reasons. JSON backups export the entire shared inventory, not only rendered cards.

## Qualification and creator evidence

Official pages are read directly, then exact hotel-specific MakeMyTrip/Agoda/Booking searches supply classification evidence. A property needs a source URL and actual category excerpt for >=3 stars; guest ratings and amenities cannot supply category. A missing/unmatched classification source stays Needs review. A sourced 1/2-star property is excluded with its reason. Known cleanliness/maintenance concerns are excluded pending review.

Instagram, YouTube and Facebook receive separate exact-name/site prompts. The model's actual grounding queries are audited and retained; it can rewrite queries, so an unaudited query is labelled Search execution unconfirmed. Gemini grounding is **not a deterministic raw search API**. Concrete grounded post URLs, independent account role, creator identity, post date, description snippet and disclosure are stored. Hotel-owned and unknown-role evidence cannot increase the independent-creator count. YouTube oEmbed provides an additional actual title/channel check, but no invented publication date or sponsorship claim.

Two distinct independent creators in a dated 60-day window produce **High probability collaboration** and a ranking boost. This remains an inference. A disclosed paid/hosted promotion requires an actual disclosure, including relevant collaboration/hosted/PR/partnership tokens. Cross-platform aliases only merge with identity evidence. Future dates and unknown dates do not create a campaign cluster.

Discovery and deep research are separate durable jobs so Gemini cannot hold up geographic traversal. Research next 20 selects fairly across districts from the persistent queue. Other candidates remain Needs review until researched; collected does not mean qualified.

## Access and operational boundaries

A private workspace access code creates a signed, HttpOnly, SameSite cookie. The bootstrap link uses a URL fragment, then removes it from browser history. The same code connects other devices to one workspace. Server credentials are encrypted Vercel variables; the service role stays exclusively inside the fresh Supabase project's Edge runtime. Public/anonymous database grants and RPC execution are revoked; every public table has RLS. The gateway implements custom authentication, so its platform JWT verifier is intentionally disabled.

Required server variables: `HOTEL_SUPABASE_URL`, `HOTEL_STORE_TOKEN`, `HOTEL_WORKSPACE_CODE`, existing `GOOGLE_PLACES_API_KEY` and Vertex workload-identity variables. Optional `HOTEL_OVERPASS_URL` changes the Overpass endpoint. The gateway token is hashed in the private `hotel_private.gateway_keys` table. No credentials are committed.

Boundary provenance and limitations:
- District geometry: guneetnarula/indian-district-boundaries, derived from DataMeet contributors. Pinned dataset contains the 23 parent district polygons; later administrative renaming/subdivision does not create geographic holes. MIT license included; DataMeet attribution is retained (CC BY 4.0 data).
- KMA operational mask: published ArcGIS `KolkataMetropolitanArea_Boundary` block geometry from service item `70dea84ef86d4269815b738f24aacbdd`. This is an operational block-level mask, not a certified cadastral boundary.
- Sundarbans: an explicitly pinned conservative policy envelope approximating the Indian region / northern Dampier–Hodges boundary, not a legally surveyed biosphere polygon. Boundary-edge classifications should be reviewed against authoritative GIS when available.
- OSM attribution: https://www.openstreetmap.org/copyright. Store and export OSM-derived data with the applicable ODbL attribution/requirements.
- Google content storage/export must be reviewed against the project's Maps agreement before unrestricted long-term archival. Place IDs have an explicit indefinite-storage exemption; do not assume that exemption extends to names, photos, contacts or reviews. See https://developers.google.com/maps/documentation/places/web-service/policies. This implementation's requested persistent fields are not a certification of provider retention permission.

## Validation

- `tests/hotel-geo.test.js`: geographic corner coverage, holes/thin intersections, quad splits, valid API types, page/saturation decisions, fuzzy identity, unknown OSM category, incomplete Overpass response, coordinate exclusions and creator/date rules.
- `tests/hotel-store.test.sql`: transactional deduplication, CRM retention, source barrier, exclusive claims, replayed checkpoints, false completion prevention, blocked-cell resumption, global excluded search and anonymous-access protection. Entire test rolls back.
- Next.js production build compiles both durable workflows.
- Test small geographic selections before initiating a statewide scan; full coverage is a substantial persistent queue, not one fast Gemini answer.
