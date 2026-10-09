(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GZRFQ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STATUS = new Set(["pending", "corroborated_public", "needs_serial_confirmation", "epc_verified", "rejected"]);

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>'"]/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[ch]);
  }

  function normalize(value) {
    return text(value).toLowerCase().replace(/[\s_]+/g, " ");
  }

  function isValidOem(value) {
    return /^[A-Z0-9][A-Z0-9-]{3,40}$/i.test(text(value));
  }

  function validateResearchCatalog(catalog) {
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error("Catalog must be an object.");
    if (catalog.schemaVersion !== 2) throw new Error("schemaVersion must be 2.");
    if (catalog.model !== "7FD25") throw new Error("Phase 1 catalog model must be 7FD25.");
    if (!Array.isArray(catalog.parts) || !catalog.parts.length) throw new Error("Catalog parts are required.");

    const ids = new Set();
    const oems = new Map();

    for (const part of catalog.parts) {
      if (!part || typeof part !== "object" || Array.isArray(part)) throw new Error("Each part must be an object.");
      const id = text(part.id);
      if (!id || ids.has(id)) throw new Error("Part IDs must be unique and non-empty.");
      ids.add(id);

      const status = text(part.researchStatus || "pending");
      if (!STATUS.has(status)) throw new Error("Unsupported research status.");

      const nums = Array.isArray(part.oemNumbers) ? part.oemNumbers.map(text).filter(Boolean) : [];
      if (nums.some(n => !isValidOem(n))) throw new Error("Invalid OEM format.");

      if (status === "pending" && nums.length) {
        throw new Error("Pending records must not publish a specific OEM.");
      }

      if (status === "corroborated_public") {
        if (!nums.length) throw new Error("Corroborated records require at least one OEM.");
        if (!Array.isArray(part.sources) || part.sources.length < 2) {
          throw new Error("Corroborated records require two public sources.");
        }
      }

      if (status === "epc_verified") {
        const sources = Array.isArray(part.sources) ? part.sources : [];
        if (!sources.some(s => ["official_catalog", "internal_record"].includes(text(s.type)))) {
          throw new Error("EPC verified records require an accepted official/internal source.");
        }
      }

      for (const oem of nums) {
        const key = normalize(oem);
        if (!oems.has(key)) oems.set(key, []);
        oems.get(key).push(id);
      }
    }

    return { partCount: ids.size, duplicateOems: [...oems.entries()].filter(([, owners]) => owners.length > 1) };
  }

  function isPublicResearchPart(part) {
    return ["corroborated_public", "epc_verified"].includes(text(part && part.researchStatus));
  }

  function needsFitmentConfirmation(part) {
    return text(part && part.fitmentStatus) !== "confirmed";
  }

  function searchParts(parts, query) {
    const q = normalize(query);
    const publicParts = (parts || []).filter(isPublicResearchPart);
    if (!q) return publicParts;
    return publicParts.filter(part => normalize([
      part.partNameEn,
      part.partNameZh,
      part.category,
      ...(part.oemNumbers || []),
      ...(part.applicableModels || [])
    ].join(" ")).includes(q));
  }

  function validateFileMeta(file) {
    if (!file) return { ok: true };
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) return { ok: false, error: "Use JPG, PNG or WEBP images." };
    if (Number(file.size) > 1024 * 1024) return { ok: false, error: "Each image must be 1 MB or smaller." };
    return { ok: true };
  }

  async function fileToPayload(file) {
    if (!file) return null;
    const meta = validateFileMeta(file);
    if (!meta.ok) throw new Error(meta.error);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return { name: text(file.name), type: text(file.type), size: bytes.length, contentBase64: btoa(binary) };
  }
  function validateRfqInput(input) {
    const errors = {};
    if (!text(input.country)) errors.country = "Country is required.";
    if (!text(input.contactName)) errors.contactName = "Contact name is required.";
    if (!text(input.companyName)) errors.companyName = "Company name is required.";
    if (!text(input.whatsappOrPhone) && !text(input.email)) errors.contact = "WhatsApp/phone or email is required.";
    if (text(input.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(input.email))) errors.email = "Email format is invalid.";
    const qty = Number(input.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) errors.quantity = "Quantity must be 1–9999.";
    if (!text(input.model)) errors.model = "Forklift model is required.";
    if (!text(input.serialNumber) && !input.nameplateFile) errors.fitment = "Serial number or nameplate photo is required before quotation.";
    return { ok: Object.keys(errors).length === 0, errors };
  }

  function makeRfqId(now, sequence) {
    const date = new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error("Invalid RFQ date.");
    const stamp = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("");
    return "GZ-RFQ-" + stamp + "-" + String(sequence || 1).padStart(4, "0");
  }

  function buildRfqPayload(input, part, options) {
    const validation = validateRfqInput(input);
    if (!validation.ok) {
      const err = new Error("RFQ validation failed.");
      err.fields = validation.errors;
      throw err;
    }
    if (!part || !isPublicResearchPart(part)) throw new Error("A publishable research part must be selected.");

    const opts = options || {};
    return {
      schemaVersion: 1,
      rfqId: makeRfqId(opts.now || new Date().toISOString(), opts.sequence || 1),
      status: "new",
      submittedAt: new Date(opts.now || Date.now()).toISOString(),
      customer: {
        country: text(input.country),
        contactName: text(input.contactName),
        companyName: text(input.companyName),
        whatsappOrPhone: text(input.whatsappOrPhone),
        email: text(input.email)
      },
      forklift: {
        brand: "Toyota",
        model: text(input.model),
        serialNumber: text(input.serialNumber),
        nameplateFile: input.nameplateFile ? {
          name: text(input.nameplateFile.name),
          type: text(input.nameplateFile.type),
          size: Number(input.nameplateFile.size) || 0
        } : null
      },
      request: {
        quantity: Number(input.quantity),
        partId: text(part.id),
        partName: text(part.partNameEn),
        candidateOem: (part.oemNumbers || [])[0] || null,
        researchStatus: text(part.researchStatus),
        fitmentStatus: text(part.fitmentStatus),
        partPhotoFile: input.partPhotoFile ? {
          name: text(input.partPhotoFile.name),
          type: text(input.partPhotoFile.type),
          size: Number(input.partPhotoFile.size) || 0
        } : null,
        customerMessage: text(input.customerMessage)
      },
      warnings: [
        "Candidate OEM/application must be confirmed by Guangzhen before quotation.",
        "Image contents are sent to the configured private RFQ receiver; without that receiver the request is not submitted."
      ]
    };
  }

  async function buildRfqSubmission(input, part, options) {
    const opts = options || {};
    const payload = buildRfqPayload(input, part, opts);
    payload.forklift.nameplateFile = await fileToPayload(opts.nameplateFile || null);
    payload.request.partPhotoFile = await fileToPayload(opts.partPhotoFile || null);
    return payload;
  }

  function partMeta(part) {
    const oem = (part.oemNumbers || [])[0] || "";
    const title = ["Toyota 7FD25", part.partNameEn, oem].filter(Boolean).join(" | ");
    return {
      title: title + " | Guangzhen Forklift Parts",
      description: "Request a fitment-confirmed quote for " + part.partNameEn + (oem ? " (" + oem + ")" : "") + " for Toyota 7FD25. Serial/nameplate confirmation required."
    };
  }

  return {
    escapeHtml,
    validateResearchCatalog,
    isPublicResearchPart,
    needsFitmentConfirmation,
    searchParts,
    validateFileMeta,
    fileToPayload,
    buildRfqSubmission,
    validateRfqInput,
    makeRfqId,
    buildRfqPayload,
    partMeta
  };
});
