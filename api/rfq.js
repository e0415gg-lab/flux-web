const crypto = require("node:crypto");

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function bad(res, status, error, details) {
  res.status(status).json({ ok: false, error, details: details || null });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, 405, "method_not_allowed");
  }

  const body = req.body && typeof req.body === "object" ? req.body : null;
  if (!body) return bad(res, 400, "invalid_json");

  const customer = body.customer || {};
  const forklift = body.forklift || {};
  const request = body.request || {};
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
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if (!model) errors.push("model");
  if (!serialNumber && !(forklift.nameplateFile && forklift.nameplateFile.name)) errors.push("fitment");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) errors.push("quantity");
  if (!partId || !partName) errors.push("part");
  if (!["corroborated_public", "epc_verified"].includes(researchStatus)) errors.push("researchStatus");

  if (errors.length) return bad(res, 400, "validation_failed", errors);

  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const rfqId = "GZ-RFQ-" + date + "-" + suffix;

  const record = {
    schemaVersion: 1,
    rfqId,
    status: "new",
    submittedAt: now.toISOString(),
    customer: { country, contactName, companyName, whatsappOrPhone, email },
    forklift: {
      brand: "Toyota",
      model,
      serialNumber,
      nameplateFile: forklift.nameplateFile || null
    },
    request: {
      quantity,
      partId,
      partName,
      candidateOem: candidateOem || null,
      researchStatus,
      fitmentStatus: clean(request.fitmentStatus, 80),
      partPhotoFile: request.partPhotoFile || null,
      customerMessage: clean(request.customerMessage, 1500)
    }
  };

  const webhook = process.env.RFQ_WEBHOOK_URL;
  if (!webhook) {
    return res.status(503).json({
      ok: false,
      error: "rfq_delivery_not_configured",
      rfqId,
      message: "Set RFQ_WEBHOOK_URL in the deployment environment before accepting real enquiries."
    });
  }

  try {
    const headers = { "content-type": "application/json" };
    if (process.env.RFQ_WEBHOOK_BEARER) headers.authorization = "Bearer " + process.env.RFQ_WEBHOOK_BEARER;
    const response = await fetch(webhook, {
      method: "POST",
      headers,
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      return bad(res, 502, "rfq_delivery_failed", { status: response.status, rfqId });
    }
    return res.status(201).json({ ok: true, rfqId, status: "new" });
  } catch (error) {
    return bad(res, 502, "rfq_delivery_failed", { rfqId, message: String(error && error.message || error) });
  }
};
