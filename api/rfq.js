const crypto = require("node:crypto");

const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function bad(res, status, error, details) {
  return res.status(status).json({ ok: false, error, details: details || null });
}

function safeFileName(value) {
  const name = clean(value, 180).replace(/[\\/\\\\\\x00-\\x1f\\x7f]/g, "_").replace(/\\.\\./g, "_");
  return name || "image";
}

function decodeImage(file, kind) {
  if (file == null) return null;
  if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error(kind + "_invalid");
  const type = clean(file.type, 40).toLowerCase();
  const contentBase64 = typeof file.contentBase64 === "string" ? file.contentBase64 : "";
  if (!ALLOWED_TYPES.has(type)) throw new Error(kind + "_type");
  if (!contentBase64 || contentBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) {
    throw new Error(kind + "_content");
  }
  const bytes = Buffer.from(contentBase64, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || Number(file.size) !== bytes.length) throw new Error(kind + "_size");
  const signatureOk = type === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : type === "image/png"
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!signatureOk) throw new Error(kind + "_signature");
  return {
    metadata: {
      name: safeFileName(file.name),
      type,
      size: bytes.length
    },
    bytes,
    contentBase64: bytes.toString("base64"),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

function isLoopbackHttp(url) {
  return process.env.NODE_ENV === "test" && url.protocol === "http:" &&
    ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, 405, "method_not_allowed");
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
  if (!body) return bad(res, 400, "invalid_json");

  const customer = body.customer && typeof body.customer === "object" ? body.customer : {};
  const forklift = body.forklift && typeof body.forklift === "object" ? body.forklift : {};
  const request = body.request && typeof body.request === "object" ? body.request : {};
  const errors = [];

  const country = clean(customer.country, 100);
  const contactName = clean(customer.contactName, 120);
  const companyName = clean(customer.companyName, 180);
  const whatsappOrPhone = clean(customer.whatsappOrPhone, 100);
  const email = clean(customer.email, 180);
  const model = clean(forklift.model, 80);
  const serialNumber = clean(forklift.serialNumber, 120);
  const quantity = Number(request.quantity);
  const partId = clean(request.partId, 120);
  const partName = clean(request.partName, 180);
  const candidateOem = clean(request.candidateOem, 80);
  const researchStatus = clean(request.researchStatus, 80);

  if (!country) errors.push("country");
  if (!contactName) errors.push("contactName");
  if (!companyName) errors.push("companyName");
  if (!whatsappOrPhone && !email) errors.push("contact");
  if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) errors.push("email");
  if (!model) errors.push("model");
  if (!serialNumber && !forklift.nameplateFile) errors.push("fitment");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) errors.push("quantity");
  if (!partId || !partName) errors.push("part");
  if (!["corroborated_public", "epc_verified"].includes(researchStatus)) errors.push("researchStatus");
  if (errors.length) return bad(res, 400, "validation_failed", errors);

  let nameplate = null;
  let partPhoto = null;
  try {
    nameplate = decodeImage(forklift.nameplateFile, "nameplate");
    partPhoto = decodeImage(request.partPhotoFile, "partPhoto");
  } catch (error) {
    const code = String(error.message || "");
    const details = {
      nameplate_invalid: "nameplateFile", nameplate_type: "nameplateFile", nameplate_content: "nameplateFile",
      nameplate_size: "nameplateFile", nameplate_signature: "nameplateFile",
      partPhoto_invalid: "partPhotoFile", partPhoto_type: "partPhotoFile", partPhoto_content: "partPhotoFile",
      partPhoto_size: "partPhotoFile", partPhoto_signature: "partPhotoFile"
    };
    return bad(res, 400, "invalid_image", details[code] || null);
  }
  const totalImageBytes = (nameplate ? nameplate.metadata.size : 0) + (partPhoto ? partPhoto.metadata.size : 0);
  if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) return bad(res, 413, "images_too_large");

  const webhookValue = process.env.RFQ_WEBHOOK_URL;
  if (!webhookValue) {
    return res.status(503).json({
      ok: false,
      error: "rfq_delivery_not_configured",
      message: "RFQ delivery is not configured. Your request was not submitted."
    });
  }

  let webhook;
  try {
    webhook = new URL(webhookValue);
  } catch (_) {
    return bad(res, 503, "rfq_delivery_misconfigured");
  }
  if (webhook.protocol !== "https:" && !isLoopbackHttp(webhook)) {
    return bad(res, 503, "rfq_delivery_misconfigured");
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const rfqId = "GZ-RFQ-" + date + "-" + suffix;
  const attachments = [
    nameplate && { attachmentId: rfqId + "-NAMEPLATE", kind: "nameplate", ...nameplate.metadata, sha256: nameplate.sha256, contentBase64: nameplate.contentBase64 },
    partPhoto && { attachmentId: rfqId + "-PART", kind: "part_photo", ...partPhoto.metadata, sha256: partPhoto.sha256, contentBase64: partPhoto.contentBase64 }
  ].filter(Boolean);

  const record = {
    schemaVersion: 2,
    rfqId,
    status: "new",
    submittedAt: now.toISOString(),
    customer: { country, contactName, companyName, whatsappOrPhone, email },
    forklift: {
      brand: "Toyota",
      model,
      serialNumber,
      nameplateFile: nameplate ? nameplate.metadata : null
    },
    request: {
      quantity,
      partId,
      partName,
      candidateOem: candidateOem || null,
      researchStatus,
      fitmentStatus: clean(request.fitmentStatus, 80),
      partPhotoFile: partPhoto ? partPhoto.metadata : null,
      customerMessage: clean(request.customerMessage, 1500)
    },
    attachments,
    dataHandling: {
      photoStorage: "private_webhook_receiver",
      publicUrls: false,
      instruction: "Store attachment bytes in access-controlled private storage; do not expose public URLs."
    },
    warnings: ["Candidate OEM/application must be confirmed by Guangzhen before quotation."]
  };

  try {
    const headers = { "content-type": "application/json" };
    if (process.env.RFQ_WEBHOOK_BEARER) headers.authorization = "Bearer " + process.env.RFQ_WEBHOOK_BEARER;
    const response = await fetch(webhook.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return bad(res, 502, "rfq_delivery_failed");
    return res.status(201).json({ ok: true, rfqId, status: "new" });
  } catch (_) {
    return bad(res, 502, "rfq_delivery_failed");
  }
};

module.exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
