# Hotel inventory discovery v4

All collection and matching rules are property-independent. No hotel leads or hotel-name exceptions are embedded in production code.

Discovery precedes research. Each town uses three query terms with up to three pages per term. A live Google Places locality viewport seeds four cells; saturated cells split to depth three, with leaf pagination. A pass scans at most twelve cells per town. Pending cells are persisted in coverage and resume on the next pass. Unavailable boundaries and saturation at the depth limit are visible. District-wide text queries supplement named towns. Coverage is broader, not exhaustive.

Every returned accommodation record is retained. All collected, Qualified stays, Needs review and Excluded separate the inventory from eligibility. Exclusion reasons include destination, property type, business status, sourced category below three stars and sourced quality concerns. Unknown category stays in review. Outside the Kolkata urban core, an ambiguous city-labelled hotel stays in review until its leisure setting is verified; a confirmed ordinary city hotel is excluded. Sourced quality flags override a contradictory good-quality label. Maps listings, category sources and quality sources remain available. Old releases discarded out-of-scope records; a fresh pass is required to recover those records.

Local search includes address and discovery towns and normalizes spaces/punctuation. Find on Google Maps is an explicit live lookup for any hotel name; no network lookup occurs on every keystroke. New results are saved in the current browser workspace. Maps IDs deduplicate results; separate duplicate Maps listings can still exist.

Research batches rotate through districts and prioritize creator evidence within each district, with twenty hotels per batch. Remaining properties stay available for subsequent research. Full inventory search and export operate on all matching records; cards render in batches of forty-eight.

Validation: production build, deterministic scope/category/search/scheduling/subdivision/resume tests, Maps request contract tests, and live lookup of multiple unrelated properties including an excluded Kolkata hotel. UI and coastal discovery verification are performed on production before reporting completion.
