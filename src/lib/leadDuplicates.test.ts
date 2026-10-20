import { afterEach, describe, expect, it, vi } from "vitest";
import { findLeadsByPhone, type LeadMatch } from "@/lib/leadDuplicates";

const match: LeadMatch = {
  id: "l1",
  name: "Dana",
  phone: "0501234567",
  event_date_interest: "2026-12-03",
  event_type_name: "חתונה",
  status: "new",
  source: "assistant",
  created_at: "2026-10-19T10:00:00Z",
};

function fakeService(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: { rpc } as any, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findLeadsByPhone", () => {
  it("doesn't search without a phone, or with fewer than 9 digits", async () => {
    const { service, rpc } = fakeService({ data: [match], error: null });
    for (const phone of [null, undefined, "", "   ", "050-12345", "12345678", "+(05) 0123-45"]) {
      expect(await findLeadsByPhone(service, "ph1", phone)).toEqual([]);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the phone as typed to the database function, which matches every format", async () => {
    const { service, rpc } = fakeService({ data: [match], error: null });
    expect(await findLeadsByPhone(service, "ph1", "+972 50-123-4567")).toEqual([match]);
    expect(rpc).toHaveBeenCalledWith("find_leads_by_phone", { p_photographer: "ph1", p_phone: "+972 50-123-4567" });
  });

  it("searches from 9 digits (a landline like 03-1234567)", async () => {
    const { service, rpc } = fakeService({ data: [], error: null });
    await findLeadsByPhone(service, "ph1", "03-1234567");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the database finds nothing or fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await findLeadsByPhone(fakeService({ data: null, error: null }).service, "ph1", "0501234567")).toEqual([]);
    expect(await findLeadsByPhone(fakeService({ data: [match], error: { message: "boom" } }).service, "ph1", "0501234567")).toEqual([]);
  });
});
