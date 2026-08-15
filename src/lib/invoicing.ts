// Single entry point for issuing a client document, regardless of which provider the photographer
// connected. Callers (the issue-document route) don't need to know Finbot uses one secret key
// while Green Invoice uses an id+secret pair minted into a JWT — they just pass the photographer's
// row and get a document link back.
import { issueReceipt, documentTypeForTaxStatus as finbotDocumentType } from "@/lib/finbot";
import { issueDocument as issueGreenInvoiceDocument, documentTypeForTaxStatus as greenInvoiceDocumentType } from "@/lib/greenInvoice";
import type { InvoiceProvider } from "@/lib/types";

export function isInvoiceProviderConnected(
  provider: InvoiceProvider,
  photographer: { finbot_api_key: string | null; green_invoice_api_id: string | null; green_invoice_api_secret: string | null }
): boolean {
  if (provider === "green_invoice") {
    return !!(photographer.green_invoice_api_id && photographer.green_invoice_api_secret);
  }
  return !!photographer.finbot_api_key;
}

export async function issueClientDocument({
  provider,
  taxStatus,
  photographer,
  customerName,
  customerEmail,
  amount,
  description,
  emailSubject,
  emailBody,
}: {
  provider: InvoiceProvider;
  taxStatus: "exempt" | "licensed";
  photographer: { finbot_api_key: string | null; green_invoice_api_id: string | null; green_invoice_api_secret: string | null };
  customerName: string;
  customerEmail: string;
  amount: number;
  description: string;
  emailSubject: string;
  emailBody: string;
}): Promise<{ documentLink: string }> {
  if (provider === "green_invoice") {
    return issueGreenInvoiceDocument({
      apiId: photographer.green_invoice_api_id ?? undefined,
      apiSecret: photographer.green_invoice_api_secret ?? undefined,
      documentType: greenInvoiceDocumentType(taxStatus),
      customerName,
      customerEmail,
      amount,
      description,
      emailBody,
    });
  }
  return issueReceipt({
    apiKey: photographer.finbot_api_key ?? undefined,
    documentType: finbotDocumentType(taxStatus),
    customerName,
    customerEmail,
    amount,
    description,
    emailSubject,
    emailBody,
  });
}
