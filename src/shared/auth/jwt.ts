import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { uuid } from "../validation/common";

const TOKEN_ISSUER = "convexa-api";

export const userRole = z.enum(["OWNER", "STAFF"]);

export type AuthUser = {
  userId: string;
  businessId: string;
  role: z.infer<typeof userRole>;
};

const accessTokenPayload = z.object({
  sub: uuid,
  businessId: uuid,
  role: userRole,
});

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { businessId: user.businessId, role: user.role },
    env.JWT_SECRET,
    {
      subject: user.userId,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_ISSUER,
    },
  );
}

export function verifyAccessToken(token: string): AuthUser {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_ISSUER,
    });
  } catch {
    throw new AppError("Token inválido ou expirado", 401);
  }

  const parsed = accessTokenPayload.safeParse(decoded);

  if (!parsed.success) {
    throw new AppError("Token inválido ou expirado", 401);
  }

  return {
    userId: parsed.data.sub,
    businessId: parsed.data.businessId,
    role: parsed.data.role,
  };
}
