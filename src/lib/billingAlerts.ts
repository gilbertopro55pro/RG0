import { sendEmail } from "@/lib/resend";
import { ADMIN_EMAIL } from "@/lib/admin";

// An email to the owner about money that needs a person (a charge to refund, a recurring to cancel
// by hand in PayPlus, a receipt to issue). Never throws: the billing step that calls it has already
// happened, and a failed alert must not undo or repeat it.
export async function alertBillingAdmin(subject: string, text: string): Promise<void> {
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: `[חיובים] ${subject}`, text });
  } catch (e) {
    console.error("Billing admin alert failed:", subject, e);
  }
}
