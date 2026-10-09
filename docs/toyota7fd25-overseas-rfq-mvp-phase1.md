# Toyota 7FD25 Overseas RFQ MVP — Phase 1

## Objective

Turn the existing Toyota 7F front-wheel visual catalog into the foundation of an overseas B2B RFQ system for Guangzhen International Trading Co., Ltd. The first validation market is Malaysia and the first public language is English.

The MVP is not a general storefront. Its primary job is:

Google / OEM / model search → identify a likely part → confirm fitment → submit RFQ → Guangzhen verifies and quotes.

## Important scope correction

For this phase, "Front Axle" means the FRONT DRIVE AXLE / FRONT WHEEL / FRONT DRUM BRAKE assembly of Toyota 7FD25.

Do NOT mix rear steer-axle king-pin parts into this dataset. King pins, steering knuckles, tie rods, and rear steering axle parts belong to a separate future catalog.

## Current repository baseline

Repository: `e0415gg-lab/flux-web`

Working branch / PR: `codex/create-web-visual-parts-catalog-for-toyota-7f` / PR #1

Current UI: `toyota7f-frontwheel-catalog.html`

Current verified functional baseline:
- 6 placeholder categories: tire, lug nut, hub, bearing, oil seal, brake
- JSON import safety checks
- pending / test / verified states
- keyboard operation and narrow-screen regression coverage
- Node.js regression test suite
- PR workflow for the existing front-wheel tests

No `AGENTS.md` or root `README.md` was found on this branch at the time of this Phase 1 specification. `TOYOTA7F_DATA_README.md` remains the current repository-specific source of truth for the catalog import rules.

## Product rules

1. Never invent an OEM number.
2. Public-source agreement is not the same as Toyota EPC verification.
3. A part may be researched and stored without being publishable.
4. Any fitment that depends on serial range must request model + serial/nameplate before quote.
5. Unknown fields remain null/empty; do not infer.
6. Do not expose a candidate OEM as "verified" unless there is a traceable source accepted by Guangzhen's data-review process.
7. First release is RFQ-first, not checkout-first.

## Research status model

Use a separate research layer instead of overloading the existing UI's `verified` flag.

- `pending`: component is expected in the assembly but exact Toyota 7FD25 diagram/OEM has not been confirmed.
- `corroborated_public`: two or more independent public sources agree on part number + application or one strong fitment source plus a second part-number source.
- `needs_serial_confirmation`: application is plausible/corroborated but serial-range variation has not been resolved.
- `epc_verified`: reserved for later use after a traceable Toyota EPC / official catalog / accepted internal source confirms the record.
- `rejected`: confirmed wrong for this assembly/application.

Public quote gate:
- `epc_verified`: eligible for normal RFQ page after internal review.
- `corroborated_public`: may be shown only as "fitment confirmation required"; never label as official Toyota fitment.
- `pending`: do not show as a specific OEM product page.

## First corroborated Toyota 7FD25 front-drive candidates

These are RESEARCH CANDIDATES, not yet Toyota-EPC verified.

### 42415-23420-71 — front axle hub oil seal
Public fitment evidence:
- Lift Parts Warehouse: Toyota 7-8FD20-25 / 7-8FG20-25 applications, including 7FD25.
- Folangsi: "OIL SEAL, FRONT AXLE HUB", part 42415-23420-71, application Toyota 7-8FD20~25 / 7-8FG20~25.

Research status: `corroborated_public`
Quote rule: serial/nameplate confirmation required until EPC/internal verification.

### 42431-23420-71 — brake drum / hub
Public fitment evidence:
- Dada Parts: brake drum & hub, 42431-23420-71, used for 7FD20 / 7FD25.
- ForkliftPartSales independently identifies 42431-23420-71 as Toyota brake drum.

Research status: `corroborated_public`
Quote rule: serial/nameplate confirmation required until EPC/internal verification.

### 47410-23420-71 — brake wheel cylinder
Public fitment evidence:
- Sourcefy lists Toyota 7FDU20 / 7FDU25 among applications.
- Helmar identifies 47410-23420-71 as a Toyota wheel cylinder and shows 7FDU/8FDU application families.
- Chiean Chiang catalog search result explicitly labels 47410-23420-71 for Toyota 7FD25, 1-1/8 inch.

Research status: `corroborated_public`
Quote rule: confirm truck model/serial and RH/LH applicability before quote.

### 47405-23600-71 — brake shoe
Public fitment evidence:
- Lift Parts Warehouse lists Toyota 3-8FD/FG20-25 application families.
- SS Parts Brasil explicitly lists Toyota 7FD25 / 7FG25 / 8FD25 / 8FG25.
- Helmar identifies the same part as Toyota forklift brake shoe.

Research status: `corroborated_public`
Quote rule: confirm serial/application before quote.

### 42483-23420-71 + 90179-16003-71 — front hub bolt + nut
Public fitment evidence:
- Folangsi: hub bolt including nut for Toyota 7-8FD20~25; includes 42483-23420-71 and 90179-16003-71.
- Motofork: same pair, application Toyota 7-8FD20~25 / 7-8FG20~25.
- ForkliftPartSales independently identifies 90179-16003-71 as Toyota hub nut.

Research status: `corroborated_public`
Quote rule: confirm wheel/hub configuration and serial before quote.

## Candidate component list for the first MVP dataset

The machine-level target is 20–30 candidate component records. Exact OEM values must stay blank unless they pass the research gate.

1. Front tire
2. Front wheel/rim
3. Front hub bolt
4. Front hub nut
5. Brake drum
6. Front wheel hub
7. Front axle hub outer oil seal
8. Front axle shaft / inner oil seal
9. Front hub inner bearing
10. Front hub outer bearing
11. Bearing spacer / thrust washer
12. Hub adjusting/retaining nut
13. Lock washer / retainer
14. Front axle shaft
15. Axle shaft retaining ring / snap ring
16. Brake shoe — primary
17. Brake shoe — secondary
18. Brake wheel cylinder
19. Wheel-cylinder repair kit
20. Brake upper return spring
21. Brake lower return spring
22. Brake shoe hold-down pin
23. Brake shoe hold-down spring / cup
24. Brake adjuster screw assembly
25. Brake adjuster lever / cable
26. Brake anchor pin / shoe support
27. Brake backing plate
28. Bleeder screw / dust cap

These records are discovery targets. They must not be positioned on the final exploded diagram until the actual diagram/item-number relationship is confirmed.

## Phase 1 data model

Create a new model that can coexist with the current import-demo model.

Top-level catalog:

```json
{
  "schemaVersion": 2,
  "catalogId": "toyota-7fd25-front-drive-axle",
  "brand": "Toyota",
  "series": "7F",
  "model": "7FD25",
  "system": "front-drive-axle",
  "market": "international",
  "language": "en",
  "parts": []
}
```

Part record:

```json
{
  "id": "stable-slug",
  "figureNumber": null,
  "itemNumber": null,
  "partNameEn": "",
  "partNameZh": "",
  "category": "",
  "side": null,
  "position": null,
  "oemNumbers": [],
  "crossReferences": [],
  "guangzhenSku": null,
  "applicableModels": ["7FD25"],
  "serialRange": null,
  "dimensions": null,
  "image": null,
  "diagramImage": null,
  "researchStatus": "pending",
  "fitmentStatus": "needs_serial_confirmation",
  "publishStatus": "hold",
  "quoteAllowed": false,
  "nameplateRequired": true,
  "partPhotoRequired": false,
  "sources": [],
  "lastReviewedAt": null,
  "notes": ""
}
```

Source record:

```json
{
  "type": "supplier_catalog|supplier_product|trade_record|official_catalog|internal_record",
  "name": "",
  "url": "",
  "supports": ["part_number", "fitment", "dimensions"],
  "checkedAt": "YYYY-MM-DD"
}
```

## RFQ model

RFQ request fields:

Required:
- country
- contactName
- companyName
- whatsappOrPhone OR email
- quantity
- model
- selectedPartId OR typedPartNumber OR uploadedPartPhoto

Recommended / conditional:
- serialNumber
- nameplatePhoto
- partPhoto
- customerMessage

Auto-populated from the selected part:
- brand
- model
- system
- figureNumber
- itemNumber
- candidate OEM
- research/fitment status

RFQ number format:
`GZ-RFQ-YYYYMMDD-####`

RFQ status:
`new → identifying → verified → sourcing → quoted → customer_confirmed → paid → shipped → closed`

For Phase 1, only `new`, `identifying`, `verified`, and `quoted` need UI support.

## Public UX

First English MVP routes:

- `/en/toyota/7fd25`
- `/en/toyota/7fd25/front-drive-axle`
- `/en/toyota/7fd25/front-drive-axle/:part-slug`
- `/en/parts/:oem`
- `/en/rfq`

Entry methods:
1. Search by part/OEM number
2. Search by forklift model
3. Find by diagram
4. Upload part photo / nameplate

Part page CTA:
- Request Quote
- Send Nameplate
- Upload Part Photo

Do not implement payment/checkout in Phase 1.

## SEO rules

Every publishable part must have:
- unique URL
- canonical title
- English part name
- Toyota + 7FD25 + system context
- OEM/MPN only if not pending
- indexable text outside the diagram SVG
- structured data only when the underlying record is publishable

Never generate SEO pages for pending OEM guesses.

## Codex Phase 1 implementation order

1. Preserve current PR #1 regression behavior.
2. Add schema-v2 research dataset parser/validator separately from the existing v1 demo importer.
3. Add English 7FD25 front-drive-axle catalog route/page.
4. Render only records whose publish rules allow display; pending discovery records may appear only as generic diagram categories without an OEM claim.
5. Add part detail route.
6. Add RFQ cart/request model.
7. Add photo/nameplate upload UI with local validation; backend storage may be stubbed if repository has no backend yet.
8. Add serial/nameplate fitment warning.
9. Add SEO metadata generation.
10. Add tests for:
   - no unverified OEM leaks to public UI
   - pending parts cannot become quoteable by malformed JSON
   - corroborated parts show "fitment confirmation required"
   - mobile 390px rendering
   - keyboard access
   - RFQ validation
   - HTML escaping
   - duplicate OEM handling
   - route slug stability

## Phase 1 acceptance criteria

The Phase 1 implementation is ready for staging when:

- Existing 8 regression tests continue to pass.
- New tests cover schema-v2 and RFQ rules.
- No record marked `pending` can expose a specific OEM on a public page.
- The five corroborated candidates can be loaded into the research layer without being mislabeled as Toyota-EPC verified.
- A user can select a displayed part and create an RFQ payload.
- Model + serial/nameplate warning is visible before submission.
- 390px mobile view has no horizontal overflow.
- No checkout/payment is present.
- The page clearly states that fitment must be confirmed before quotation where required.

## Out of scope for Phase 1

- Full Toyota 7F machine catalog
- Rear steer axle / king pin system
- Toyota 8F
- Thai / Bahasa Indonesia localization
- payment gateway
- ERP
- invoice / packing-list automation
- auto-pricing
- auto-ordering
- AI-generated OEM guesses
- scraping behind authentication/paywalls

## Research references captured for this phase

- Lift Parts Warehouse — 42415-23420-71 front axle hub seal:
  https://www.liftpartswarehouse.com/product-p/ty42415-23420-71.htm
- Folangsi — 42415-23420-71:
  https://www.folangsiforklift.com/Products/DriveParts/FrontAxleHubAssemblies/show_2680.html
- Dada Parts — 42431-23420-71 brake drum & hub:
  https://www.dadaparts.com/toyota-forklift-brake-drum-42431-23420-71/
- ForkliftPartSales — 42431-23420-71:
  https://www.forkliftpartsales.com/site/itemdetail/TY42431-23420-71
- Sourcefy — 47410-23420-71:
  https://www.sourcefy.com/products/wheel-cylinder-47410-2342071
- Helmar — 47410-23420-71:
  https://www.helmarparts.com/47410-23420-71-wheel-cylinder/
- Lift Parts Warehouse — 47405-23600-71:
  https://www.liftpartswarehouse.com/product-p/ty47405-23600-71.htm
- Folangsi — 42483-23420-71 + 90179-16003-71:
  https://www.folangsiforklift.com/Products/DriveParts/FrontAxleHubAssemblies/show_2744.html
- Motofork — 42483-23420-71 + 90179-16003-71:
  https://www.motofork.com/products/hub-bolt-26
- ForkliftPartSales — 90179-16003-71 hub nut:
  https://www.forkliftpartsales.com/site/itemdetail/TY90179-16003-71

## Next research gate

Before a final public site is built:
- obtain a traceable 7FD25 front-drive-axle exploded diagram / EPC figure
- map item numbers to these candidate records
- resolve serial ranges
- confirm bearing and seal positions
- identify exact spring/adjuster/hardware OEMs
- capture Guangzhen internal SKU/stock/price data separately from public source data


## RFQ receiver and private photo contract

The browser sends the selected JPG/PNG/WEBP image bytes as base64 to `POST /api/rfq`. Each image is limited to 1 MiB and the combined original bytes to 2 MiB. The API checks the MIME type against the file signature, exact byte count, email/contact fields and candidate status, assigns a server-side RFQ ID, hashes each image with SHA-256, and forwards the RFQ and photo bytes only to an HTTPS `RFQ_WEBHOOK_URL`. Redirects are rejected. `RFQ_WEBHOOK_BEARER` is optional and must be configured as a deployment secret.

Webhook receiver contract:

- Require the configured bearer token when one is set; acknowledge only after the complete RFQ and all attachments are accepted.
- Decode `attachments[].contentBase64`, verify `size` and `sha256`, and save bytes to access-controlled private storage keyed by `rfqId` and `attachmentId`.
- Keep the file name as display metadata only; never use it as a storage path. Do not create public URLs or expose the attachment bytes in logs.
- Preserve the mapping in `attachments[].kind` (`nameplate` or `part_photo`) and the same RFQ ID on the enquiry. Retention/deletion policy must be set on the receiving storage service.
- Return a 2xx response only after storage succeeds. On timeout or non-2xx the form reports that delivery is unconfirmed and advises checking before retrying.

CI uses a loopback-only test receiver bound to `127.0.0.1`. It verifies the bearer, writes synthetic images to a temporary directory with directory mode 0700 and file mode 0600, checks that both byte streams and their RFQ association match, then deletes the temporary files. It is a test fixture, not a deployed API route.

No production receiver or storage credentials are present in this repository. Until `RFQ_WEBHOOK_URL` is configured to a receiver implementing this private-storage contract, the endpoint returns 503 and must not be represented as live enquiry intake. Do not remove the page's `noindex,nofollow` staging guard as part of this integration.
