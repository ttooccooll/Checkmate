import QRCode from "qrcode";
import { requestProvider } from "webln";

let cancelQRPayment = false;

export async function generateInvoice(item) {
  try {
    const resp = await fetch("/api/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ item }),
    });
    
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Non-JSON response from server:", text);
      throw new Error("Failed to generate invoice: server did not return JSON");
    }

    if (!resp.ok || !data.paymentRequest) {
      console.error("Invalid invoice data:", data);
      throw new Error("Failed to generate invoice");
    }

    return data.paymentRequest;
  } catch (err) {
    console.error("Invoice generation error:", err);
    throw err;
  }
}

export async function payInvoice(paymentRequest) {
  try {
    const webln = await requestProvider();
    await webln.enable();
    await webln.sendPayment(paymentRequest);
  } catch (err) {
    throw new Error(`Payment failed: ${err.message}`);
  }
}

export async function payWithQR(item) {
  try {
    const resp = await fetch("/api/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ item }),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse QR invoice JSON:", text, err);
      return false;
    }

    if (!resp.ok || !data.paymentRequest || !data.paymentHash) {
      console.error("Invalid QR invoice data:", data);
      return false;
    }

    const invoice = data.paymentRequest;
    const paymentHash = data.paymentHash;

    const container = document.getElementById("qr-container");
    const canvas = document.getElementById("qr-code");
    const invoiceText = document.getElementById("invoice-text");

    cancelQRPayment = false;

    // Show the container first — a display:none element measures as 0
    invoiceText.textContent = invoice;
    container.classList.add("visible");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const canvasSize = Math.round(
      Math.max(160, Math.min(container.clientWidth * 0.8, 220))
    );
    await QRCode.toCanvas(canvas, invoice, { width: canvasSize, margin: 2 });

    // Pin the displayed size square so no stylesheet rule can stretch it
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;

    const paid = await waitForPayment(paymentHash);

    container.classList.remove("visible");
    return paid;

  } catch (err) {
    console.error("QR payment failed:", err);
    return false;
  }
}

export async function waitForPayment(paymentHash, timeout = 5 * 60 * 1000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const interval = setInterval(async () => {
      if (cancelQRPayment) {
        clearInterval(interval);
        resolve(false);
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval);
        resolve(false);
        return;
      }

      try {
        const resp = await fetch(`/api/check-invoice?paymentHash=${paymentHash}`, {
          cache: "no-store",
        });
        if (!resp.ok) throw new Error(`Invoice check failed: ${resp.status}`);

        const data = await resp.json();
        if (data.paid) {
          clearInterval(interval);
          cancelQRPayment = true;
          resolve(true);
        }
      } catch (err) {
        console.error("waitForPayment error:", err);
      }
    }, 1000);
  });
}

export async function makePayment(item) {
  try {
    // Try the WebLN extension first. requestProvider rejects fast when no
    // provider is installed — checked before creating any invoice so the
    // no-extension path doesn't waste one.
    try {
      const webln = await requestProvider();
      await webln.enable();
      const invoice = await generateInvoice(item);
      await webln.sendPayment(invoice);
      return true;
    } catch (weblnErr) {
      console.warn("WebLN failed, falling back to QR:", weblnErr);
    }

    const qrSuccess = await payWithQR(item);
    return qrSuccess;
  } catch (err) {
    console.error("Payment failed:", err);
    return false;
  }
}

const cancelBtn = document.getElementById("cancel-payment-btn");
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    cancelQRPayment = true;
    document.getElementById("qr-container")?.classList.remove("visible");
  });
}

const copyBtn = document.getElementById("copy-invoice-btn");
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const text = document.getElementById("invoice-text")?.textContent;
    if (text) await navigator.clipboard.writeText(text);
  });
}