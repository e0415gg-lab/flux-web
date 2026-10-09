const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "toyota7f-frontwheel-catalog.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const fixture = JSON.parse(fs.readFileSync(path.join(root, "data/toyota7f-frontwheel-parts.test.json"), "utf8"));

function setup() {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element("div"));
      return elements.get(id);
    },
    createElement: element,
  };
  function element(tagName) {
    const node = {
      tagName, style: {}, dataset: {}, value: "", className: "", clientWidth: 800, clientHeight: 540,
      textContent: "", attributes: {}, children: [], handlers: {},
      classList: { contains(value) { return node.className.split(" ").includes(value); } },
      addEventListener(kind, callback) { node.handlers[kind] = callback; },
      setAttribute(kind, value) { node.attributes[kind] = value; },
      appendChild(child) { child.parent = node; node.children.push(child); },
      remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
      querySelectorAll(selector) {
        return node.children.filter(child => child.classList.contains(selector.slice(1)));
      },
      querySelector(selector) {
        const id = selector.match(/data-part-id="([^"]+)"/)?.[1];
        return node.children.find(child => child.dataset.partId === id);
      },
      focus() { document.activeElement = node; },
    };
    let innerHTML = "";
    Object.defineProperty(node, "innerHTML", {
      get: () => innerHTML,
      set(value) { innerHTML = value; node.children = []; },
    });
    return node;
  }
  const context = vm.createContext({ document, structuredClone, ResizeObserver: class { observe() {} } });
  const run = code => vm.runInContext(code, context);
  run(script);
  function validate(payload) {
    context.payload = payload;
    return run("validateImportedParts(payload)");
  }
  async function importPayload(payload, name = "test.json") {
    const event = { target: { files: [{ name, text: async () => typeof payload === "string" ? payload : JSON.stringify(payload) }], value: name } };
    await elements.get("dataFile").handlers.change(event);
    assert.equal(event.target.value, "");
  }
  return { run, validate, importPayload, elements, document };
}

test("test fixture contains no part numbers; 1 test plus 5 pending, search, clear and reset", async () => {
  const app = setup();
  assert.equal(app.run("partsData.every(p => p.verification.status === 'pending')"), true);
  await app.importPayload(fixture);
  assert.match(app.elements.get("dataStatus").textContent, /0 筆有核對紀錄、1 筆僅供測試，其餘 5 筆待確認/);
  assert.equal(app.run("partsData.length"), 6);
  assert.equal(app.run("partsData.filter(isTest).length"), 1);
  assert.equal(app.run("partsData.filter(isVerified).length"), 0);
  assert.equal(app.run("hasPartNumber(partsData[0])"), false);
  assert.match(app.elements.get("detailCard").innerHTML, /僅供測試・不可報價/);
  assert.match(app.elements.get("detailCard").innerHTML, /測試記錄/);
  assert.match(app.elements.get("detailCard").innerHTML, /Toyota OEM 料號<\/div><div>—/);
  app.elements.get("searchInput").value = "匯入流程測試";
  app.elements.get("searchInput").handlers.input({ target: { value: "匯入流程測試" } });
  assert.equal(app.run("state.filtered.length"), 1);
  assert.equal(app.elements.get("canvasWrap").children.length, 1);
  app.elements.get("clearBtn").handlers.click();
  assert.equal(app.run("state.filtered.length"), 6);
  app.elements.get("resetDataBtn").handlers.click();
  assert.equal(app.run("partsData.every(p => p.verification.status === 'pending')"), true);
  assert.doesNotMatch(app.elements.get("detailCard").innerHTML, /匯入流程測試/);
});

test("invalid payloads and every imported string field are rejected", () => {
  const app = setup();
  for (const payload of [null, [], "text", 42, {}, { ...fixture, parts: [] }]) {
    assert.throws(() => app.validate(payload));
  }
  const invalid = [
    f => f.schemaVersion = 2,
    f => f.catalog = "other",
    f => f.parts[0] = null,
    f => f.parts[0] = [],
    f => f.parts[0].id = "unknown",
    f => f.parts[0].id = 1,
    f => f.parts.push(structuredClone(f.parts[0])),
    f => f.parts[0].verification = null,
    f => f.parts[0].verification.status = "pending",
    f => f.parts[0].verification.status = "other",
    f => f.parts[0].verification.source = " ",
    f => f.parts[0].verification.source = [],
    f => f.parts[0].verification.checkedAt = "2026-02-30",
    f => f.parts[0].verification.checkedAt = "2026-2-03",
    f => f.parts[0].verification.checkedAt = null,
    f => f.parts[0].verification.status = "verified",
  ];
  for (const mutate of invalid) {
    const bad = structuredClone(fixture);
    mutate(bad);
    assert.throws(() => app.validate(bad));
  }
  for (const value of [null, [], {}, 123, true]) {
    for (const key of ["oem", "sku", "note"]) {
      const bad = structuredClone(fixture);
      bad.parts[0][key] = value;
      assert.throws(() => app.validate(bad), undefined, key);
    }
    for (const key of ["jianzhang", "zefeng"]) {
      const bad = structuredClone(fixture);
      bad.parts[0].aftermarket[key] = value;
      assert.throws(() => app.validate(bad), undefined, key);
    }
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      const bad = structuredClone(fixture);
      bad.parts[0].aftermarket = value;
      assert.throws(() => app.validate(bad));
    }
  }
});

test("verified requires a supplied code and test forbids codes; other fields can stay blank", async () => {
  // Explicit synthetic input for branch coverage; never part of a production fixture.
  for (const field of ["oem", "sku", "jianzhang", "zefeng"]) {
    const app = setup();
    const payload = structuredClone(fixture);
    const target = ["jianzhang", "zefeng"].includes(field) ? payload.parts[0].aftermarket : payload.parts[0];
    target[field] = " __UNIT_TEST_ONLY__ ";
    assert.throws(() => app.validate(payload));
    payload.parts[0].verification.status = "verified";
    payload.parts[0].verification.source = "Synthetic unit-test record, not a real part reference";
    await app.importPayload(payload);
    assert.equal(app.run("partsData.filter(isVerified).length"), 1);
    assert.match(app.elements.get("dataStatus").textContent, /1 筆有核對紀錄、0 筆僅供測試/);
    assert.match(app.elements.get("detailCard").innerHTML, /已填料號有核對紀錄/);
    app.run('applyFilter("__unit_test_only__")');
    assert.equal(app.run("state.filtered.length"), 1);
  }
});

test("names, hotspots and unknown fields cannot be overwritten; missing optional fields normalize", () => {
  const app = setup();
  const payload = structuredClone(fixture);
  payload.parts[0].name = "<img src=x>";
  payload.parts[0].hotspot = { x: 999, y: 999 };
  payload.parts[0].extra = "ignored";
  payload.parts[0].verification.extra = "ignored";
  delete payload.parts[0].oem;
  delete payload.parts[0].aftermarket;
  delete payload.parts[0].sku;
  delete payload.parts[0].note;
  const result = app.validate(payload)[0];
  assert.equal(result.name, "前輪輪胎");
  assert.equal(result.hotspot.x, 23);
  assert.equal(result.extra, undefined);
  assert.equal(result.verification.extra, undefined);
  assert.equal(result.oem, "");
  assert.equal(result.aftermarket.jianzhang, "");
  assert.match(result.note, /尚待來源核對/);
});

test("invalid JSON or later invalid row preserves loaded data, search and selection atomically", async () => {
  const app = setup();
  await app.importPayload(fixture);
  app.run('applyFilter("匯入流程測試")');
  const before = app.run("JSON.stringify({partsData, state})");
  await app.importPayload("{");
  assert.match(app.elements.get("dataStatus").textContent, /載入失敗/);
  assert.equal(app.run("JSON.stringify({partsData, state})"), before);
  const bad = structuredClone(fixture);
  bad.parts.push({ id: "hub", verification: { status: "pending" } });
  await app.importPayload(bad);
  assert.equal(app.run("JSON.stringify({partsData, state})"), before);
});

test("HTML in note/source is escaped; date checks include leap-year boundaries", async () => {
  const app = setup();
  const payload = structuredClone(fixture);
  payload.parts[0].note = '<img src=x onerror="alert(1)">';
  payload.parts[0].verification.source = "<script>synthetic test</script>";
  await app.importPayload(payload);
  const detail = app.elements.get("detailCard").innerHTML;
  assert.match(detail, /&lt;img/);
  assert.match(detail, /&lt;script&gt;/);
  assert.doesNotMatch(detail, /<img|<script>/);
  assert.equal(app.run('isValidIsoDate("2024-02-29")'), true);
  assert.equal(app.run('isValidIsoDate("2026-02-29")'), false);
  assert.equal(app.run('isValidIsoDate("2026-13-01")'), false);
});

test("empty results, native button semantics and focus survive list/hotspot selection", () => {
  const app = setup();
  for (const id of ["list", "canvasWrap"]) {
    const button = app.elements.get(id).children[1];
    assert.equal(button.tagName, "button");
    assert.equal(button.type, "button");
    button.focus();
    button.handlers.click();
    const replacement = app.elements.get(id).children[1];
    assert.equal(app.document.activeElement, replacement);
    assert.equal(replacement.attributes["aria-pressed"], "true");
    assert.equal(app.run("state.activeId"), "lug_nut");
  }
  app.run('applyFilter("no matching record")');
  assert.equal(app.run("state.filtered.length"), 0);
  assert.equal(app.elements.get("emptyState").style.display, "block");
  assert.equal(app.elements.get("canvasWrap").children.length, 0);
  assert.match(app.elements.get("detailCard").innerHTML, /找不到資料/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /\.file-label input\s*{\s*display:\s*none/);
});

test("hotspots follow SVG letterboxing at desktop and narrow widths", () => {
  const app = setup();
  const canvas = app.elements.get("canvasWrap");
  for (const [width, height] of [[800, 540], [600, 540], [280, 420], [1000, 540]]) {
    canvas.clientWidth = width;
    canvas.clientHeight = height;
    app.run("renderHotspots()");
    const button = canvas.children[0];
    const scale = Math.min(width / 800, height / 540);
    assert.equal(parseFloat(button.style.left), (width - 800 * scale) / 2 + .23 * 800 * scale);
    assert.equal(parseFloat(button.style.top), (height - 540 * scale) / 2 + .55 * 540 * scale);
  }
});
