import { describe, it, expect } from "vitest";
import {
  runWithTenant,
  runWithAuth,
  getBusinessId,
  getCurrentUser,
} from "./tenant-context";

const authUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  businessId: "22222222-2222-4222-8222-222222222222",
  role: "OWNER",
} as const;

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

  it("deriva o businessId do usuário autenticado", () => {
    runWithAuth(authUser, () => {
      expect(getBusinessId()).toBe(authUser.businessId);
      expect(getCurrentUser()).toEqual(authUser);
    });
  });

  it("lança ao pedir o usuário fora de um contexto autenticado", () => {
    expect(() => getCurrentUser()).toThrow();
  });

  it("lança ao pedir o usuário num contexto que só tem tenant", () => {
    runWithTenant("business-1", () => {
      expect(() => getCurrentUser()).toThrow();
    });
  });
});
