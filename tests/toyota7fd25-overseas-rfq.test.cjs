const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const api = require(path.join(root, "assets", "toyota7fd25-overseas-rfq.js"));
const publicParts = require(path.join(root, "assets", "toyota7fd25-frontaxle-public-data.js"));
const research = JSON.parse(fs.readFileSync(path.join(root, "data", "toyota7fd25-frontaxle-mvp.candidates.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "toyota7fd25-overseas-rfq.html"), "utf8");

test("research catalog validates and pending records cannot carry OEM numbers", () => {
  const result = api.validateResearchCatalog(research);
  assert.equal(result.partCount, research.parts.length);

  const bad = structuredClone(research);
  const pending = bad.parts.find(p => p.researchStatus === "pending");
  pending.oemNumbers = ["__FAKE_OEM__"];
  assert.throws(() => api.validateResearchCatalog(bad), /Pending records must not publish/);
});

test("corroborated records require two sources", () => {
  const bad = structuredClone(research);
  const part = bad.parts.find(p => p.researchStatus === "corroborated_public");
  part.sources = [part.sources[0]];
  assert.throws(() => api.validateResearchCatalog(bad), /two public sources/);
});

test("public dataset contains only publishable research candidates", () => {
  assert.ok(publicParts.length >= 6);
  assert.equal(publicParts.every(api.isPublicResearchPart), true);
  assert.equal(publicParts.every(p => Array.isArray(p.oemNumbers) && p.oemNumbers.length >= 1), true);
  assert.equal(publicParts.every(p => p.fitmentStatus === "needs_serial_confirmation"), true);
});

test("search matches OEM, English name and model", () => {
  assert.equal(api.searchParts(publicParts, "47410-23420-71")[0].id, "brake-wheel-cylinder");
  assert.ok(api.searchParts(publicParts, "brake shoe").some(p => p.id === "brake-shoe"));
  assert.ok(api.searchParts(publicParts, "7FD25").length >= 4);
});

test("RFQ requires contact and serial or nameplate", () => {
  const base = {
    country: "Malaysia",
    contactName: "Buyer",
    companyName: "ABC Forklift",
    whatsappOrPhone: "+6012345678",
    email: "",
    quantity: 10,
    model: "7FD25",
    serialNumber: "",
    nameplateFile: null
  };
  let result = api.validateRfqInput(base);
  assert.equal(result.ok, false);
  assert.ok(result.errors.fitment);

  result = api.validateRfqInput({
    ...base,
    nameplateFile: { name: "nameplate.jpg", type: "image/jpeg", size: 1200 }
  });
  assert.equal(result.ok, true);
});

test("RFQ payload is stable and keeps candidate status explicit", () => {
  const part = publicParts.find(p => p.id === "brake-wheel-cylinder");
  const payload = api.buildRfqPayload({
    country: "Malaysia",
    contactName: "Buyer",
    companyName: "ABC Forklift",
    whatsappOrPhone: "+6012345678",
    email: "",
    quantity: 3,
    model: "7FD25",
    serialNumber: "7FD25-TEST",
    nameplateFile: null,
    partPhotoFile: null,
    customerMessage: "Need aftermarket option"
  }, part, { now: "2026-10-08T07:00:00Z", sequence: 9 });

  assert.equal(payload.rfqId, "GZ-RFQ-20261008-0009");
  assert.equal(payload.status, "new");
  assert.equal(payload.request.candidateOem, "47410-23420-71");
  assert.equal(payload.request.researchStatus, "corroborated_public");
  assert.match(payload.warnings.join(" "), /confirmed by Guangzhen/);
});

test("file metadata validation rejects unsafe file types and large files", () => {
  assert.equal(api.validateFileMeta({ type: "image/jpeg", size: 1024 }).ok, true);
  assert.equal(api.validateFileMeta({ type: "application/pdf", size: 1024 }).ok, false);
  assert.equal(api.validateFileMeta({ type: "image/png", size: 6 * 1024 * 1024 }).ok, false);
});

test("staging page stays noindex and has mobile/RFQ safety copy", () => {
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(html, /Fitment confirmation required/);
  assert.match(html, /Serial or nameplate photo is required/);
  assert.match(html, /@media\(max-width:390px\)/);
  assert.match(html, /No online payment/);
  assert.match(html, /not an official Toyota EPC exploded diagram/i);\n  assert.match(html, /not presented as Toyota EPC-verified fitment/i);
});
