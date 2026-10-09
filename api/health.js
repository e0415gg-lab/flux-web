module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  return res.status(200).json({
    ok: true,
    service: "guangzhen-toyota7fd25-rfq",
    rfqDeliveryConfigured: Boolean(process.env.RFQ_WEBHOOK_URL)
  });
};
