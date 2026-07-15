import { getNwcClient, withTimeout, PRICES_SATS } from "./_lib/nwc.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { item } = req.body || {};
  const amountSats = PRICES_SATS[item];
  if (!amountSats) {
    return res.status(400).json({ error: "Unknown item" });
  }

  let client;
  try {
    client = getNwcClient();
    const invoice = await withTimeout(
      client.makeInvoice({
        amount: amountSats * 1000, // NWC amounts are millisats
        description: `Checkmate Delivery: ${item}`,
        expiry: 600,
      })
    );

    return res.status(200).json({
      paymentHash: invoice.payment_hash,
      paymentRequest: invoice.invoice,
      satoshis: amountSats,
    });
  } catch (err) {
    console.error("create-invoice failed:", err);
    return res.status(502).json({ error: "Could not create invoice" });
  } finally {
    client?.close();
  }
}
