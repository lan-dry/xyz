import { describe, expect, it } from "vitest";

import { ConsoleForbiddenError, requireRole } from "./roles";

describe("requireRole", () => {
  it("viewer cannot satisfy developer gate", () => {
    expect(() => requireRole({ role: "viewer" }, "developer")).toThrow(ConsoleForbiddenError);
  });

  it("developer satisfies developer gate", () => {
    expect(() => requireRole({ role: "developer" }, "developer")).not.toThrow();
  });
});
