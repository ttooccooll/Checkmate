import fetch from "node-fetch";

export default async function handler(req, res) {
  const paymentHash = req.query.paymentHash;
  if (!paymentHash) {
    return res.status(400).json({ error: "Missing paymentHash" });
  }

  try {
    const query = `
      query InvoiceStatusByHash($input: LnInvoicePaymentStatusByHashInput!) {
        lnInvoicePaymentStatusByHash(input: $input) {
          paymentHash
          status
        }
      }
    `;

    const variables = {
      input: { paymentHash }
    };

    const response = await fetch(process.env.BLINK_SERVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.BLINK_API_KEY
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: "Blink API error", details: text });
    }

    const json = await response.json();
    if (json.errors) {
      return res.status(500).json({ error: "GraphQL error", details: json.errors });
    }

    const invoiceStatus = json.data?.lnInvoicePaymentStatusByHash;

    if (!invoiceStatus) {
      return res.status(404).json({ error: "Invoice not found", details: json });
    }

    const status = invoiceStatus.status;

    return res.status(200).json({
      paid: status === "PAID",
      status
    });

  } catch (err) {
    return res.status(500).json({ error: "Blink API failed", details: err.message });
  }
}