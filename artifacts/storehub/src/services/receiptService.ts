import type { Sale, UserProfile } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptOptions {
  includeItemCount?: boolean;
  includePaymentMethod?: boolean;
  width?: number; // ESC/POS width: 32 (standard), 48 (wide)
  headerText?: string;
  footerText?: string;
}

export interface PrinterConfig {
  type: "espos" | "browser";
  model?: string; // e.g., "Star Micronics TSP100", "Epson TM-T88"
  connection?: "usb" | "network" | "bluetooth";
  ipAddress?: string; // for network printers
}

// ─── Receipt HTML Generation ──────────────────────────────────────────────────

export function generateReceiptHTML(
  sale: Sale,
  profile: UserProfile,
  options: ReceiptOptions = {},
): string {
  const headerText = options.headerText || profile.paymentSettings?.receiptHeader || profile.storeName;
  const footerText = options.footerText || profile.paymentSettings?.receiptFooter || "Thank you!";
  const width = options.width || 32;

  const logoHtml = profile.logoDataUrl
    ? `<img src="${profile.logoDataUrl}" alt="Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;">`
    : "";

  const itemsHtml = sale.items
    .map(
      item => `
    <tr>
      <td style="text-align: left; padding: 4px 0;">${item.productName}</td>
      <td style="text-align: center; padding: 4px 0;">${item.quantity}x</td>
      <td style="text-align: right; padding: 4px 0;">$${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `,
    )
    .join("");

  const discountHtml =
    sale.subtotal !== sale.total + sale.tax
      ? `
    <tr style="border-top: 1px dashed #000; padding-top: 4px;">
      <td colspan="2" style="text-align: left; padding: 4px 0;">Discount</td>
      <td style="text-align: right; padding: 4px 0;">-$${(sale.subtotal - (sale.total - sale.tax)).toFixed(2)}</td>
    </tr>
  `
      : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Receipt #${sale.receiptNumber}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: "Courier New", monospace;
          font-size: 12px;
          line-height: 1.4;
          background: #fff;
          color: #000;
          padding: 0;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
            width: 80mm;
          }
        }
        .receipt {
          max-width: 80mm;
          margin: 0 auto;
          padding: 0;
          text-align: center;
        }
        .header {
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px dashed #000;
        }
        .store-name {
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .store-info {
          font-size: 10px;
          color: #333;
        }
        .receipt-number {
          font-size: 10px;
          margin: 8px 0;
          color: #666;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        th {
          text-align: left;
          font-weight: bold;
          border-bottom: 1px dashed #000;
          padding: 4px 0;
          font-size: 11px;
        }
        td {
          padding: 3px 0;
          font-size: 11px;
        }
        .totals {
          margin: 10px 0;
          border-top: 1px solid #000;
          border-bottom: 1px dashed #000;
          padding: 8px 0;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          font-size: 13px;
          margin: 4px 0;
        }
        .subtotal-row,
        .tax-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin: 2px 0;
        }
        .footer {
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px dashed #000;
          font-size: 10px;
          color: #666;
        }
        .thank-you {
          font-weight: bold;
          margin-bottom: 8px;
          font-size: 12px;
        }
        .timestamp {
          font-size: 9px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="header">
          ${logoHtml}
          <div class="store-name">${headerText}</div>
          ${profile.storeAddress ? `<div class="store-info">${profile.storeAddress}</div>` : ""}
          ${profile.storeCity ? `<div class="store-info">${profile.storeCity}</div>` : ""}
        </div>

        <div class="receipt-number">
          Receipt #${sale.receiptNumber}
          <br>
          ${new Date(sale.createdAt).toLocaleDateString()} ${new Date(sale.createdAt).toLocaleTimeString()}
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
            ${discountHtml}
          </tbody>
        </table>

        <div class="totals">
          <div class="subtotal-row">
            <span>Subtotal:</span>
            <span>$${sale.subtotal.toFixed(2)}</span>
          </div>
          ${sale.tax > 0 ? `<div class="tax-row"><span>Tax:</span><span>$${sale.tax.toFixed(2)}</span></div>` : ""}
          <div class="total-row">
            <span>TOTAL:</span>
            <span>$${sale.total.toFixed(2)}</span>
          </div>
        </div>

        ${sale.loyaltyPointsUsed ? `<div style="margin-top:8px;font-size:11px;">Points used: ${sale.loyaltyPointsUsed}</div>` : ""}

        ${
          sale.amountPaid > 0
            ? `
          <div style="margin: 10px 0; font-size: 11px;">
            <div style="display: flex; justify-content: space-between;">
              <span>Amount Paid:</span>
              <span>$${sale.amountPaid.toFixed(2)}</span>
            </div>
            ${sale.change > 0 ? `<div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Change:</span><span>$${sale.change.toFixed(2)}</span></div>` : ""}
          </div>
        `
            : ""
        }

        <div class="footer">
          <div class="thank-you">${footerText}</div>
          <div class="timestamp">${new Date(sale.createdAt).toLocaleTimeString()}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

// ─── Printing ──────────────────────────────────────────────────────────────────

export function printReceipt(
  sale: Sale,
  profile: UserProfile,
  options: ReceiptOptions = {},
): void {
  const html = generateReceiptHTML(sale, profile, options);
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    console.error("Failed to open print window. Pop-ups may be blocked.");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load, then trigger print
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

export async function printReceiptToESPOS(
  sale: Sale,
  profile: UserProfile,
  printerConfig: PrinterConfig,
): Promise<void> {
  // ESC/POS protocol for receipt printers (Star Micronics, Epson, etc.)
  // This is a placeholder — actual implementation would need the printer driver

  const receiptText = generateReceiptText(sale, profile);

  // Convert to ESC/POS commands
  // In production, this would communicate with the printer via USB/Network/Bluetooth
  console.log("ESC/POS Receipt:", receiptText);
  console.log("Printer Config:", printerConfig);

  // Mock: send to printer
  // const response = await fetch(`http://${printerConfig.ipAddress}/print`, {
  //   method: 'POST',
  //   body: escposBuffer,
  // });
}

// ─── Email & SMS (Backend Integration) ────────────────────────────────────────

export async function emailReceipt(sale: Sale, email: string, profile: UserProfile): Promise<void> {
  try {
    const response = await fetch("/api/receipts/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: sale.id,
        email,
        storeName: profile.storeName,
        receiptNumber: sale.receiptNumber,
      }),
    });

    if (!response.ok) {
      throw new Error(`Email failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Failed to email receipt:", error);
    throw error;
  }
}

export async function smsReceipt(sale: Sale, phoneNumber: string, profile: UserProfile): Promise<void> {
  try {
    const response = await fetch("/api/receipts/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: sale.id,
        phoneNumber,
        storeName: profile.storeName,
        total: sale.total,
        receiptNumber: sale.receiptNumber,
      }),
    });

    if (!response.ok) {
      throw new Error(`SMS failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Failed to send receipt SMS:", error);
    throw error;
  }
}

// ─── Plain Text Receipt ────────────────────────────────────────────────────────

function generateReceiptText(sale: Sale, profile: UserProfile): string {
  const lines: string[] = [];
  const width = 40;

  // Header
  lines.push(centerText(profile.storeName, width));
  if (profile.storeAddress) {
    lines.push(centerText(profile.storeAddress, width));
  }
  if (profile.storeCity) {
    lines.push(centerText(profile.storeCity, width));
  }
  lines.push("");

  // Receipt info
  lines.push(`Receipt #${sale.receiptNumber}`);
  lines.push(new Date(sale.createdAt).toLocaleDateString());
  lines.push(new Date(sale.createdAt).toLocaleTimeString());
  lines.push("-".repeat(width));
  lines.push("");

  // Items
  for (const item of sale.items) {
    const qty = `${item.quantity}x`;
    const amount = `$${(item.price * item.quantity).toFixed(2)}`;
    const line = `${item.productName.substring(0, width - 8)} ${qty} ${amount}`;
    lines.push(line.substring(0, width));
  }
  lines.push("");
  lines.push("-".repeat(width));

  // Totals
  lines.push(rightAlignText(`Subtotal: $${sale.subtotal.toFixed(2)}`, width));
  if (sale.tax > 0) {
    lines.push(rightAlignText(`Tax: $${sale.tax.toFixed(2)}`, width));
  }
  lines.push(rightAlignText(`TOTAL: $${sale.total.toFixed(2)}`, width));

  if (sale.amountPaid > 0) {
    lines.push(rightAlignText(`Paid: $${sale.amountPaid.toFixed(2)}`, width));
  }
  if (sale.change > 0) {
    lines.push(rightAlignText(`Change: $${sale.change.toFixed(2)}`, width));
  }
  if ((sale as any).loyaltyPointsUsed) {
    lines.push(rightAlignText(`Points used: ${(sale as any).loyaltyPointsUsed}`, width));
  }

  lines.push("");
  lines.push("-".repeat(width));
  lines.push(centerText("Thank you!", width));
  lines.push("");

  return lines.join("\n");
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(padding) + text;
}

function rightAlignText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  return " ".repeat(padding) + text;
}
