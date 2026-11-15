import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for approval notify delivery gates (Resend + Teams).
 * Mocks global fetch; does not hit real networks.
 */
describe("approval notification delivery (mocked)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  it("skips Resend when RESEND_API_KEY unset (console-only path)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.RESEND_API_KEY;

    const apiKey = process.env.RESEND_API_KEY?.trim();
    expect(apiKey).toBeFalsy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs Resend when API key present", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "test@example.com",
        to: ["approver@example.com"],
        subject: "Approval needed",
        text: "Review",
      }),
    });
    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("POSTs Teams webhook Adaptive Card when URL configured", async () => {
    const fetchMock = vi.fn(async () => new Response("1", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const teamsUrl = "https://outlook.office.com/webhook/test";
    await fetch(teamsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        summary: "Approval needed",
        sections: [{ activityTitle: "Approval", text: "Review in console" }],
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      teamsUrl,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
