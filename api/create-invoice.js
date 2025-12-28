import fetch from "node-fetch";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { amount, memo } = req.body;
  if (!amount || isNaN(amount))
    return res.status(400).json({ error: "Amount must be a number" });

  try {
    const invoiceId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);

    const query = `
      mutation CreateLnInvoice($input: LnInvoiceCreateInput!) {
        lnInvoiceCreate(input: $input) {
          invoice {
            paymentHash
            paymentRequest
            externalId
            satoshis
          }
          errors { message }
        }
      }
    `;

    const variables = {
      input: {
        amount: parseInt(amount),
        walletId: process.env.BLINK_WALLET_ID,
        memo: memo || "Checkmate Game Payment",
        externalId: invoiceId
      }
    };

    const response = await fetch(process.env.BLINK_SERVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.BLINK_API_KEY
      },
      body: JSON.stringify({ query, variables })
    });

    const json = await response.json();
    if (json.errors || json.data.lnInvoiceCreate.errors.length > 0) {
      return res.status(500).json({
        error: "Failed to create invoice",
        details: json.errors || json.data.lnInvoiceCreate.errors
      });
    }

    const inv = json.data.lnInvoiceCreate.invoice;

    return res.status(200).json({
      paymentHash: inv.paymentHash,
      paymentRequest: inv.paymentRequest,
      externalId: inv.externalId,
      satoshis: inv.satoshis
    });

  } catch (err) {
    console.error("Server exception:", err);
    res.status(500).json({ error: err.message });
  }
}
