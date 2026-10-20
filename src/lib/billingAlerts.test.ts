import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));

import { ADMIN_EMAIL } from "@/lib/admin";
import { alertBillingAdmin } from "@/lib/billingAlerts";
import { sendEmail } from "@/lib/resend";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("alertBillingAdmin", () => {
  it("emails the admin with the billing tag on the subject", async () => {
    vi.mocked(sendEmail).mockResolvedValue(undefined as never);
    await alertBillingAdmin("חיוב כפול", "account 123 was charged twice");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith({ to: ADMIN_EMAIL, subject: "[חיובים] חיוב כפול", text: "account 123 was charged twice" });
  });

  it("never throws when the email fails, so the billing step isn't undone or repeated", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmail).mockRejectedValue(new Error("Resend down"));
    await expect(alertBillingAdmin("קבלה נכשלה", "details")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
