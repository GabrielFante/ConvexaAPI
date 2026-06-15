import { describe, it, expect } from "vitest";
import { runWithTenant, getBusinessId } from "./tenant-context";

describe("tenant-context", () => {
  it("expõe o businessId dentro do contexto", () => {
    runWithTenant("business-1", () => {
      expect(getBusinessId()).toBe("business-1");
    });
  });

  it("lança quando chamado fora de um contexto de tenant", () => {
    expect(() => getBusinessId()).toThrow();
  });

  it("isola contextos aninhados", () => {
    runWithTenant("a", () => {
      runWithTenant("b", () => {
        expect(getBusinessId()).toBe("b");
      });
      expect(getBusinessId()).toBe("a");
    });
  });
});
