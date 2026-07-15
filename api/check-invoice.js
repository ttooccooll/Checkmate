import { getNwcClient, withTimeout } from "./_lib/nwc.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  const paymentHash = req.query.paymentHash;
  if (!/^[0-9a-f]{64}$/i.test(paymentHash || "")) {
    return res.status(400).json({ error: "Invalid paymentHash" });
  }

  let client;
  try {
    client = getNwcClient();
    const tx = await withTimeout(
      client.lookupInvoice({ payment_hash: paymentHash })
    );

    const paid = tx.state === "settled" || tx.settled_at > 0;
    const expired = !paid && tx.expires_at > 0 && tx.expires_at * 1000 < Date.now();

    return res.status(200).json({
      paid,
      status: paid ? "PAID" : expired ? "EXPIRED" : "PENDING",
    });
  } catch (err) {
    if (err?.code === "NOT_FOUND") {
      return res.status(404).json({ error: "Invoice not found" });
    }
    console.error("check-invoice failed:", err);
    return res.status(502).json({ error: "Could not check invoice" });
  } finally {
    client?.close();
  }
}
