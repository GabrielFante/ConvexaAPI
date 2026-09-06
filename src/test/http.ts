import { signAccessToken, type AuthUser } from "../shared/auth/jwt";

export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";

export const OWNER_A = "aaaaaaaa-1111-4111-8111-111111111111";
export const STAFF_A = "aaaaaaaa-2222-4222-8222-222222222222";
export const OWNER_B = "bbbbbbbb-1111-4111-8111-111111111111";

export function tokenFor(user: Partial<AuthUser> = {}): string {
  return signAccessToken({
    userId: user.userId ?? OWNER_A,
    businessId: user.businessId ?? TENANT_A,
    role: user.role ?? "OWNER",
  });
}

export function bearer(user: Partial<AuthUser> = {}): string {
  return `Bearer ${tokenFor(user)}`;
}
