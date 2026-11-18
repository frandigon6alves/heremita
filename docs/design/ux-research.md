# Heremita: product and UX research for a mobile-first trip planner

Date: 2026-11-18. **[E]** = backed by a source I fetched today (numbered list at the end). **[J]** = my own judgement or inference.

**Method and limits.** I read help centres, product pages, UX research and public reviews. I did not use any competitor hands-on: flows are reported as their help pages describe them. Review evidence is the most recent US App Store reviews in Apple's public feed (150 each for Wanderlog, Polarsteps, TripIt and Tripsy, 100 for Roadtrippers, 49 for Stippl) plus Trustpilot for Wanderlog (53 reviews, mostly negative). Counts are keyword matches; reviews are self-selected, so read them as themes, not rates.

## 1. Findings

### 1.1 Core loop: collect, organise, route

| Product | How the loop is built [E] | Reviews [E] |
|---|---|---|
| Wanderlog | Lists and itinerary days share one document beside the map. Founder: "I just dump places that look cool into a big list, and then only arrange it later" [7]. Time and distance sit between consecutive stops [3]. | Positive reviews mention ease of use (41), group sharing (31), the map (22); route optimisation is praised in about 10 and criticised in none. 18 of 22 low ratings mention paying, trials, the account wall or pop-ups; others cite "bloated ... a ton of scrolling", "not always clear where you are assigning things", no view-only mode [9]. |
| Google My Maps | Layers: 10 at most, 2,000 features each; each set of directions is its own layer [11]. | "My Maps isn't available for Android" or iPhone; phones only view [11]. |
| Google Maps lists | Search, tap a marker or touch and hold, then Save and choose a list. Multi-stop directions are separate, capped at 9 stops [12]. | Flat lists: no days, no route (my reading) [J]. |
| Roadtrippers | Route first. "+ Add a Stop" inserts the stop where the planner finds it most efficient; a notice says which date it landed on. "Unrouted" waypoints hold maybes. Days show stops, distance and driving time. Trips are dated or "Day 1, Day 2" [15]. | 55 of 100 recent reviews are one star; 38 of those mention paying or limits. Free tier: 1 trip, 3 stops; trips above the plan get locked [9][15]. |
| Polarsteps | A tracker with a Plan tab: steps with arrival date and nights, reordered by drag or by editing dates. Explore (apps only) includes editorially curated trips [16]. | Praise: privacy control. Complaints: date picker blocks the first trip, "too many clicks", no undo, places not found, one primary transport mode [9]. |
| Stippl, Tripsy, TripIt | Stippl: destinations, route, day timeline, "browse real itineraries ... make them your own" [17]. TripIt and Tripsy build itineraries from forwarded booking e-mails [9]. | Stippl: lag, edits reverting. Tripsy: manual entry, clustered pins that never split [9]. |

**Mobile web [E].** Google offers no My Maps on phones, only viewing [11]. A Wanderlog reviewer: "the browser version pushes you to the app" [10]. Polarsteps Explore and Roadtrippers offline maps exist only in native apps [15][16]. A Stippl reviewer plans on desktop and consults on the phone [9]. **[J]** Nobody treats mobile web as first-class: that is Heremita's opening, and it means no proven reference exists for touch editing in a browser.

### 1.2 Map plus content on a phone

- **[E]** NN/g: a non-modal bottom sheet fits when people must keep using the background (its example is Google Maps). Support Back to dismiss, show a Close button besides the grab handle, never stack sheets, keep sheets for short interactions [18]. Apple HIG: sheets rest at detents (medium is about half height, large, or custom); a tap on the grabber cycles them [19].
- **[E]** "Bottom is easier to reach" is "largely incorrect" [18]. Hoober's field data: people "prefer to view and touch the center of the screen"; corner targets need about 12 mm against 7 mm in the centre [20].
- **[E]** A map behind a link goes unused: on hotel sites defaulting to a list, 65% of users never used the map; Baymard recommends list and map side by side [22]. NN/g's older locator study warned that crowded pins are hard to tap and that a map embedded in a scrolling page gets panned by accident [21]. **[J]** A persistent map under one sheet is the phone equivalent of the split view; from tablet width up the sheet becomes a side panel.
- **[E]** Web specifics: `100vh` is too tall while browser toolbars show, so use `dvh`/`svh`; `overscroll-behavior` stops pull-to-refresh and scroll chaining [23]. MapLibre has camera padding, which can keep the selected pin above the sheet, and `cooperativeGestures` (two-finger pan) [24], which I would reserve for maps embedded in scrolling pages [J]. OSM's tile policy: "Do not hide attribution beneath UI" [25].
- **[E]** Search: the public Nominatim API forbids autocomplete and allows 1 request per second; Photon offers search-as-you-type with location bias under fair use, without availability guarantees [26].
- **[E]** Fast add: Wanderlog adds a guide place "to the most recently edited list or day" and shows a banner with "Change" [2]; Roadtrippers puts a "+" on each card and a checkmark once added [15]. Day filter: Wanderlog shows or hides each list or day on the map from a layers button [6].
- **[E]** OSM place data is thin: about 4.9 million objects carry `opening_hours` and 0.44 million an `image`, against 35.4 million with `amenity` [27]. **[J]** OSM holds no ratings, so the place card must look complete with name, category, your note and community tips.

### 1.3 Editing the itinerary by touch

- **[E]** Touch drag needs a long press to tell a grab from a scroll; movement before the timer ends becomes a scroll, so "the user needs to be fairly intentional and precise" [32]. NN/g: "on mobile ... using menus to move a file to a different folder can be less error-prone than drag-and-drop" [28].
- **[E]** WCAG 2.2 SC 2.5.7 (AA) requires a single-pointer alternative to every drag; its examples are up and down controls on a sortable list and a pop-up menu on a task board [29]. GitHub's "move dialog" became "the preferred mode of operation for several of our users" beyond its intended audience [30]. Atlassian: every draggable gets a menu button listing outcomes such as "move to top" [31].
- **[E]** Shipping patterns: Wanderlog reorders inside a dedicated reorder menu and moves between lists or days with checkboxes and "Move to" [1]. Roadtrippers uses a long tap to drag, or a date change in the stop details [15]. Google Maps uses a hold on a "Reorder" handle in a compact list [12].
- **[E]** Failures: "There's no 'undo' option" (Polarsteps); editing dates leaves stops "out of order" (Roadtrippers) [9]. NN/g: reserve confirmations for irreversible actions and "go to great lengths to provide undo" [38].

### 1.4 Routes

- **[E]** Wanderlog shows time and distance per leg, changes mode when the leg is tapped, and puts a "Directions" button on each leg that opens Google or Apple Maps [3][4]. A reviewer liked that the mode "auto switches from driving to walking if the distance is short" and that the route opens "with a single tap" [8]. Wanderlog and Roadtrippers show day totals [9][15].
- **[E]** Wanderlog optimises one day at a time (a Pro feature per its help page): pick start and end or "Auto-suggest", then "See what's changed or revert back" from a banner [5].
- **[E]** Estimates can mislead: Wanderlog apologises for "extremely wrong" travel times [6].
- **[E]** Hand-off without keys: Google's universal URL takes origin, destination, `travelmode` (driving, walking, bicycling, transit) and waypoints, but only "three waypoints ... on mobile browsers" [13]. Apple's `maps.apple.com/directions` takes source, destination, waypoint and mode from iOS 18.4 [14]. **[J]** Hand off one leg at a time; a transit link covers the mode Heremita does not compute.

### 1.5 Community content

- **[E]** From e-commerce research (transfer to places is my assumption): the ratings distribution is the most used part of a review section, 53% of users seek out negative reviews, and a distribution is not worth showing with 5 or fewer ratings [33]. Purchase likelihood peaks at 4.0 to 4.7 stars and most of the lift comes from the first five reviews [34].
- **[E]** Cold start: Polarsteps curates trips editorially [16]; Stippl lets people copy real itineraries [17]; Chris Dixon: "attract users with a single-player tool and then ... get them to participate in a network" [35]. Wanderlog adds "top travel guides from the web" [9]; Trustpilot reviewers call its website content "AI created" and wrong [10], and 5 of the 12 entries under its "Recent guides" had 0 likes [42]. A Roadtrippers reviewer on stale reviews: "Most I see are in the 2000 teens" [9].
- **[E]** Minimum moderation, borrowing Apple's rule for user content: a filter for objectionable material, a report mechanism with timely response, blocking of abusive users, published contact details [36]. The EU DSA also requires an easy electronic notice mechanism from hosting providers (read on an unofficial mirror) [37].
- **[E]** Privacy: Polarsteps keeps planning notes visible only to the owner even on a public trip [16]; Roadtrippers makes new trips public by default [15].

### 1.6 First run

- **[E]** NN/g: login walls carry "high interaction cost" and defy reciprocity; avoid onboarding tutorials and teach in context; empty states should offer "direct pathways", demo data included [38].
- **[E]** Wanderlog's web tool lets people "start planning a trip without creating an account" [8]; Stippl is browsable with "no account needed" [17]. Reviews punish the opposite: "an Account Creation wall at the front of the app", a forced trial, "Too many popups", a contacts permission request at setup [9][10].
- **[E]** Safari can delete a site's script-writable storage after a period without visits (seven days in the 2020 policy); iOS offers no install prompt [39]. **[J]** A guest draft kept only in the browser can vanish: label it "saved on this device" and offer an account once the guest has invested.

### 1.7 The solo traveller

- **[E]** Morning Consult (US, February 2025): flexibility is the top advantage of travelling alone (54%); only 17% of solo travellers plan a detailed itinerary and 18% plan none; 60% of women call physical safety a top drawback against 39% of men [40].
- **[E]** Hostelworld (3,334 solo travellers, July 2025): freedom and spontaneity are valued most (64%), 35% book last minute, 41% worry about safety (55% of women), 23% share plans or location as a precaution [41].
- **[J]** For the hermit: plans stay loose and cheap to change, nothing social is required, and a read-only link for someone at home is a safety feature. For the hermit crab: the trip is a home you carry, so it works offline, exports cleanly and stays private unless you choose otherwise.

### 1.8 Pitfalls and cheap delighters

- **Pitfalls [E]:** account or trial walls [9]; limits that lock people's own trips [15]; public by default [15]; filler content posing as community [10]; an editor as the only phone view ("putting users in Edit mode the second they want to view their daily itinerary") [9]; no access on the road ("I cannot access my trip plan while I'm sitting on my vacation") [10]; no print or export [10]; places that cannot be added by hand [9]. OSM's own tile servers prohibit prefetching, so offline maps would need another tile source [25].
- **Delighters [J]:** numbered pins coloured by day; a day totals line; Undo on every change; walking as the default for short legs; a gentle "this day looks full" hint (Polarsteps warns about over-ambitious plans [16]); "transit directions in Google Maps" per leg; print stylesheet and GPX/KML export; a private link for a trusted contact; "copy this trip"; a closed-that-day badge where OSM has opening hours; free dark mode (a reviewer resented paying for it [9]).

## 2. UX principles, in priority order

Evidence is in the sections named; the rules themselves are my judgement.

1. **Loose first, days later.** "Ideas" is the default bucket; dates are optional ("Day 1"); nothing forces day-by-day planning. (1.1, 1.7)
2. **The map never leaves.** One non-modal sheet with three snap points (peek, half, full; start near 15%, 50% and 90% of the height); no stacked sheets; long content opens as a page; Back closes the top layer. (1.2)
3. **Two taps from map to saved.** Tap a place or result, then one button naming its destination ("Add to Day 2"), then a toast with Change and Undo. The note field is right there. Custom pins always work. (1.2, 1.3)
4. **Every drag has a tap twin.** Each stop has a menu: Move to day, Move up, Move down, Remove. Dragging by a handle is an enhancement inside a compact reorder mode. Undo replaces confirmation. (1.3)
5. **Plan mode and Trip mode.** On the road the default is a read-only Today view: next stop, leg time, Directions. Editing is one deliberate tap away. (1.8)
6. **Routes are per day, per leg and reversible.** Leg chips between stops, mode per leg, day totals, optimisation as a suggestion with fixed start and end plus revert, hand-off per leg, estimates labelled as estimates. (1.4)
7. **Useful alone, better together.** Private notes and public tips are separate objects. Show an average only above five ratings, always show counts and visit dates, never fabricate density. (1.5)
8. **No wall before value.** Guests browse public trips and build a draft; the account request comes on syncing, publishing or reviewing. No pop-ups. (1.6)
9. **Private by default.** Sharing is deliberate; public trips hide exact dates; report and block sit on all user content. (1.5, 1.7)
10. **The trip is portable.** Itinerary and notes readable offline, exportable and printable. (1.8)
11. **Thumb-safe targets.** At least 44 CSS px (the WCAG AA floor is 24 [29]); nothing essential in the top corners; no hover-only affordances; attribution visible above the sheet. (1.2)

## 3. Proposed screen inventory (all [J])

| # | Screen | Primary action |
|---|---|---|
| 1 | Explore (public, no login): featured public trips, destination search | Start a trip |
| 2 | Planner: full-screen map, search pill, day chips (All, Ideas, Day 1..n), itinerary sheet | Add a place |
| 3 | Search overlay: typeahead biased to the visible map, recents, "drop a pin here" | Pick a result |
| 4 | Place quick card (sheet at peek or half): name, category, my note, rating summary | Add to [selected day] |
| 5 | Place page: my note, tips and ratings, facts, links out | Write a tip |
| 6 | Day view: stops with leg chips, day totals | Directions for the next leg |
| 7 | Reorder and move mode: compact rows, handles, multi-select, "Move to" | Done |
| 8 | Optimise suggestion: before and after, time saved, start and end | Apply (with revert) |
| 9 | Trip mode, Today: read-only timeline | Directions to next stop |
| 10 | My trips: cards with dates or day count, sync state | New trip |
| 11 | Trip settings and share: dates, privacy, link, export, print, delete | Copy share link |
| 12 | Public trip page (read-only): map, days, author, visit date | Copy to my trips |
| 13 | Tip form: rating, short text, visit month | Publish |
| 14 | Sign in or sign up (contextual, returns to the draft) | Continue |
| 15 | Profile: my tips, public trips, blocked users, language | Edit profile |
| 16 | Report sheet (from any user content) | Send report |
| 17 | Moderation queue (owner only) | Hide content |

Every screen needs empty (direct path plus a demo trip), loading, offline and error states.

## Sources

1. Wanderlog help, Move a place: https://help.wanderlog.com/hc/en-us/articles/5159751100443-Move-a-place
2. Wanderlog help, Add a place from a guide: https://help.wanderlog.com/hc/en-us/articles/5159511810843-Add-a-place-from-a-guide-to-trip-plan
3. Wanderlog help, Time and distance: https://help.wanderlog.com/hc/en-us/articles/5159565134875-See-time-and-distance-between-places
4. Wanderlog help, Directions to next stop: https://help.wanderlog.com/hc/en-us/articles/5159616762779-Open-directions-to-next-itinerary-stop-in-Google-Apple-Maps
5. Wanderlog help, Optimize route: https://help.wanderlog.com/hc/en-us/articles/13545624787867-Optimize-route
6. Wanderlog help, Travel time estimates: https://help.wanderlog.com/hc/en-us/articles/13301772286491-Travel-time-estimates-not-accurate-or-not-available ; Hide lists or days on map: https://help.wanderlog.com/hc/en-us/articles/5159543865499-Hide-lists-or-days-on-map
7. Wanderlog founders, Product Hunt: https://www.producthunt.com/p/wanderlog/wanderlog-for-ios-and-android
8. Wanderlog FAQ: https://wanderlog.com/blog/faq ; independent review: https://brooksreview.net/2023/05/wanderlog
9. Apple public review feed, e.g. https://itunes.apple.com/us/rss/customerreviews/page=1/id=1476732439/sortby=mostrecent/json and https://itunes.apple.com/lookup?id=1476732439 (ids: Wanderlog 1476732439, Polarsteps 947925763, Stippl 6443617088, Roadtrippers 944060491, Tripsy 1429967544, TripIt 311035142)
10. Trustpilot, Wanderlog: https://www.trustpilot.com/review/wanderlog.com
11. Google My Maps help: https://support.google.com/mymaps/answer/3024933 , https://support.google.com/mymaps/answer/3024925 , https://support.google.com/mymaps/answer/3502610 , https://support.google.com/mymaps/answer/3024454?co=GENIE.Platform%3DAndroid
12. Google Maps help: https://support.google.com/maps/answer/3184808 , https://support.google.com/maps/answer/7280933 , https://support.google.com/maps/answer/144339
13. Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
14. Apple unified Maps URLs: https://developer.apple.com/documentation/mapkit/unified-map-urls
15. Roadtrippers help: https://support.roadtrippers.com/hc/en-us/articles/18377569598100 , https://support.roadtrippers.com/hc/en-us/articles/200638409-Adding-Places-to-Trips , https://support.roadtrippers.com/hc/en-us/articles/15954258888084-Planning-With-Dates-on-Your-Trip , https://support.roadtrippers.com/hc/en-us/articles/201310983-Rearrange-stops-on-your-trip , https://support.roadtrippers.com/hc/en-us/articles/208444986 , https://support.roadtrippers.com/hc/en-us/articles/201222146 , https://support.roadtrippers.com/hc/en-us/articles/360000832006-Offline-Maps
16. Polarsteps help: https://support.polarsteps.com/hc/en-us/articles/24265886208914-How-do-I-plan-my-trip , https://support.polarsteps.com/hc/en-us/articles/34772880134034-How-do-I-use-the-Explore-tab
17. Stippl: https://www.stippl.io/
18. NN/g, Bottom sheets: https://www.nngroup.com/articles/bottom-sheet/
19. Apple HIG, Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
20. Hoober, Design for Fingers, Touch, and People: https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php
21. NN/g, Maps on mobile: https://www.nngroup.com/articles/mobile-maps-locations/
22. Baymard, Split view: https://baymard.com/blog/accommodations-split-view
23. web.dev, viewport units: https://web.dev/blog/viewport-units ; MDN, overscroll-behavior: https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
24. MapLibre GL JS docs: https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/ , https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/PaddingOptions/
25. OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/ ; attribution guidelines: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
26. Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/ ; Photon: https://photon.komoot.io/
27. OSM taginfo: https://taginfo.openstreetmap.org/keys/opening_hours
28. NN/g, Drag and drop: https://www.nngroup.com/articles/drag-drop/
29. W3C, SC 2.5.7: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html ; SC 2.5.8: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
30. GitHub, accessible sortable list: https://github.blog/engineering/user-experience/exploring-the-challenges-in-creating-an-accessible-sortable-list-drag-and-drop/
31. Atlassian, drag and drop accessibility: https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines/
32. hello-pangea/dnd, touch: https://github.com/hello-pangea/dnd/blob/main/docs/sensors/touch.md
33. Baymard, ratings distribution: https://baymard.com/blog/user-ratings-distribution-summary
34. Spiegel Research Center: https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/
35. Chris Dixon: https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network
36. Apple App Review Guidelines, 1.2: https://developer.apple.com/app-store/review/guidelines/
37. DSA Article 16 (unofficial mirror): https://www.eu-digital-services-act.com/Digital_Services_Act_Article_16.html
38. NN/g: https://www.nngroup.com/articles/login-walls/ , https://www.nngroup.com/articles/mobile-app-onboarding/ , https://www.nngroup.com/articles/empty-state-interface-design/ , https://www.nngroup.com/articles/confirmation-dialog/
39. WebKit: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ , https://webkit.org/blog/14403/updates-to-storage-policy/ ; MDN: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
40. Morning Consult: https://intel.morningconsult.com/mc-content/analysis/solo-leisure-travel-research
41. Hostelworld, State of Solo Travel: https://social.hostelworld.com/state-of-solo-travel
42. Wanderlog guides: https://wanderlog.com/guides
