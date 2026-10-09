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
  pending.oemNumbers = ["99999-99999-71"];
  assert.throws(() => api.validateResearchCatalog(bad), /Pending records must not publish/);
});

test("corroborated records require two sources", () => {
  const bad = structuredClone(research);
  const part = bad.parts.find(p => p.researchStatus === "corroborated_public");
  part.sources = [part.sources[0]];
  assert.throws(() => api.validateResearchCatalog(bad), /two public sources/);
});

test("public dataset contains only publishable research candidates", () => {
  assert.equal(publicParts.length, 16);
  assert.equal(publicParts.every(api.isPublicResearchPart), true);
  assert.equal(publicParts.every(p => Array.isArray(p.oemNumbers) && p.oemNumbers.length >= 1), true);
  assert.equal(publicParts.every(p => p.fitmentStatus === "needs_serial_confirmation"), true);
});

test("search matches OEM, English name and model", () => {
  assert.equal(api.searchParts(publicParts, "47410-23420-71")[0].id, "brake-wheel-cylinder");
  assert.ok(api.searchParts(publicParts, "brake shoe").some(p => ["brake-shoe-primary", "brake-shoe-secondary"].includes(p.id)));
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
  assert.match(html, /not an official Toyota EPC exploded diagram/i);
  assert.match(html, /not presented as Toyota EPC-verified fitment/i);
});


test("deployment routes expose clean English URLs and staging remains noindex", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const sources = vercel.rewrites.map(r => r.source);
  assert.ok(sources.includes("/en/toyota/7fd25"));
  assert.ok(sources.includes("/en/toyota/7fd25/front-drive-axle"));
  assert.ok(sources.includes("/en/parts/:oem"));
  assert.match(html, /noindex,nofollow/);
});

test("health API reports RFQ delivery configuration without secrets", () => {
  const health = require(path.join(root, "api", "health.js"));
  const old = process.env.RFQ_WEBHOOK_URL;
  delete process.env.RFQ_WEBHOOK_URL;
  let code = null;
  let body = null;
  const res = {
    setHeader() {},
    status(value) { code = value; return this; },
    json(value) { body = value; return this; }
  };
  health({ method: "GET" }, res);
  assert.equal(code, 200);
  assert.equal(body.ok, true);
  assert.equal(body.rfqDeliveryConfigured, false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "webhook"), false);
  if (old) process.env.RFQ_WEBHOOK_URL = old;
});


test("RFQ endpoint forwards both real photo contents to a loopback-only test receiver", async () => {
  const http = require("node:http");
  const os = require("node:os");
  const apiHandler = require(path.join(root, "api", "rfq.js"));
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "gz-rfq-private-test-"));
  fs.chmodSync(storageDir, 0o700);
  const nameplateBytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("TEST-NAMEPLATE")]);
  const partBytes = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.from("TEST-PART-PHOTO")]);
  let received = null;
  const receiver = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/private-rfq" || req.headers.authorization !== "Bearer test-only-token") {
      res.writeHead(403).end();
      return;
    }
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      try {
        const record = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        for (const attachment of record.attachments) {
          const suffix = attachment.kind === "nameplate" ? "nameplate" : attachment.kind === "part_photo" ? "part-photo" : null;
          if (!suffix) throw new Error("Unexpected attachment kind.");
          const bytes = Buffer.from(attachment.contentBase64, "base64");
          if (bytes.length !== attachment.size) throw new Error("Attachment size mismatch.");
          fs.writeFileSync(path.join(storageDir, record.rfqId + "-" + suffix), bytes, { mode: 0o600, flag: "wx" });
        }
        received = record;
        res.writeHead(204).end();
      } catch (_) {
        res.writeHead(400).end();
      }
    });
  });

  const previous = {
    nodeEnv: process.env.NODE_ENV,
    webhook: process.env.RFQ_WEBHOOK_URL,
    bearer: process.env.RFQ_WEBHOOK_BEARER
  };
  try {
    await new Promise(resolve => receiver.listen(0, "127.0.0.1", resolve));
    process.env.NODE_ENV = "test";
    process.env.RFQ_WEBHOOK_URL = "http://127.0.0.1:" + receiver.address().port + "/private-rfq";
    process.env.RFQ_WEBHOOK_BEARER = "test-only-token";

    const response = { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await apiHandler({
      method: "POST",
      body: {
        customer: { country: "Malaysia", contactName: "Test Buyer", companyName: "Demo Forklift Parts Sdn. Bhd.", whatsappOrPhone: "+60000000000", email: "rfq-test@example.invalid" },
        forklift: { model: "7FD25", serialNumber: "TEST-ONLY-7FD25", nameplateFile: { name: "../serial-plate.png", type: "image/png", size: nameplateBytes.length, contentBase64: nameplateBytes.toString("base64") } },
        request: { quantity: 2, partId: "brake-wheel-cylinder", partName: "Wheel cylinder", candidateOem: "47410-23420-71", researchStatus: "corroborated_public", fitmentStatus: "needs_serial_confirmation", partPhotoFile: { name: "brake-part.jpg", type: "image/jpeg", size: partBytes.length, contentBase64: partBytes.toString("base64") }, customerMessage: "Test only; do not quote." }
      }
    }, response);

    assert.equal(response.code, 201);
    assert.equal(response.body.ok, true);
    assert.match(response.body.rfqId, /^GZ-RFQ-\d{8}-[A-F0-9]{6}$/);
    assert.equal(received.rfqId, response.body.rfqId);
    assert.equal(received.customer.companyName, "Demo Forklift Parts Sdn. Bhd.");
    assert.equal(received.forklift.serialNumber, "TEST-ONLY-7FD25");
    assert.equal(received.request.partId, "brake-wheel-cylinder");
    assert.equal(received.request.candidateOem, "47410-23420-71");
    assert.equal(received.request.researchStatus, "corroborated_public");
    assert.deepEqual(received.attachments.map(a => a.kind), ["nameplate", "part_photo"]);
    assert.equal(received.attachments[0].attachmentId, response.body.rfqId + "-NAMEPLATE");
    assert.equal(received.attachments[1].attachmentId, response.body.rfqId + "-PART");
    assert.equal(received.attachments[0].name, "_serial-plate.png");
    assert.deepEqual(fs.readFileSync(path.join(storageDir, response.body.rfqId + "-nameplate")), nameplateBytes);
    assert.deepEqual(fs.readFileSync(path.join(storageDir, response.body.rfqId + "-part-photo")), partBytes);
    assert.equal(fs.statSync(storageDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(storageDir, response.body.rfqId + "-nameplate")).mode & 0o777, 0o600);
    assert.equal(received.dataHandling.publicUrls, false);
    assert.match(received.warnings.join(" "), /confirmed by Guangzhen/);
  } finally {
    await new Promise(resolve => receiver.close(resolve));
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.webhook === undefined) delete process.env.RFQ_WEBHOOK_URL; else process.env.RFQ_WEBHOOK_URL = previous.webhook;
    if (previous.bearer === undefined) delete process.env.RFQ_WEBHOOK_BEARER; else process.env.RFQ_WEBHOOK_BEARER = previous.bearer;
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
});

test("RFQ endpoint rejects missing delivery config, forged image content and non-TLS production webhook", async () => {
  const apiHandler = require(path.join(root, "api", "rfq.js"));
  const previous = { nodeEnv: process.env.NODE_ENV, webhook: process.env.RFQ_WEBHOOK_URL };
  const base = {
    customer: { country: "Malaysia", contactName: "Test Buyer", companyName: "Demo Company", whatsappOrPhone: "+60000000000", email: "" },
    forklift: { model: "7FD25", serialNumber: "TEST-ONLY" },
    request: { quantity: 1, partId: "brake-wheel-cylinder", partName: "Wheel cylinder", candidateOem: "47410-23420-71", researchStatus: "corroborated_public" }
  };
  const invoke = async body => {
    const response = { code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await apiHandler({ method: "POST", body }, response);
    return response;
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.RFQ_WEBHOOK_URL;
    const missing = await invoke(base);
    assert.equal(missing.code, 503);
    assert.equal(missing.body.error, "rfq_delivery_not_configured");
    assert.match(missing.body.message, /not submitted/);

    process.env.RFQ_WEBHOOK_URL = "http://example.invalid/collect";
    const insecure = await invoke(base);
    assert.equal(insecure.code, 503);
    assert.equal(insecure.body.error, "rfq_delivery_misconfigured");

    process.env.RFQ_WEBHOOK_URL = "https://receiver.example.invalid/collect";
    const invalidImage = await invoke({
      ...base,
      forklift: { ...base.forklift, nameplateFile: { name: "fake.png", type: "image/png", size: 4, contentBase64: Buffer.from("NOPE").toString("base64") } }
    });
    assert.equal(invalidImage.code, 400);
    assert.equal(invalidImage.body.error, "invalid_image");
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.webhook === undefined) delete process.env.RFQ_WEBHOOK_URL; else process.env.RFQ_WEBHOOK_URL = previous.webhook;
  }
});

test("browser photo encoding enforces a 1 MB limit before request transmission", async () => {
  const api = require(path.join(root, "assets", "toyota7fd25-overseas-rfq.js"));
  const tinyPng = { name: "plate.png", type: "image/png", size: 8, async arrayBuffer() { return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer; } };
  const encoded = await api.fileToPayload(tinyPng);
  assert.equal(encoded.name, "plate.png");
  assert.equal(encoded.contentBase64, "iVBORw0KGgo=");
  assert.equal(encoded.size, 8);
  await assert.rejects(api.fileToPayload({ name: "oversized.png", type: "image/png", size: 1024 * 1024 + 1 }), /1 MB or smaller/);
});
