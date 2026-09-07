import type { AuthUser } from "../../shared/auth/jwt";
import { signAccessToken } from "../../shared/auth/jwt";
import { hashPassword, verifyPassword } from "../../shared/auth/password";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiresAt,
} from "../../shared/auth/password-reset-token";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "../../shared/auth/refresh-token";
import { env } from "../../shared/env";
import { AppError } from "../../shared/errors/AppError";
import { mailer } from "../../shared/mail/mailer";
import { passwordResetEmail } from "../../shared/mail/templates/password-reset";
import { getCurrentUser } from "../../shared/tenant/tenant-context";
import { authRepository } from "./auth.repository";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schema";

const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha inválidos";
const INVALID_SESSION_MESSAGE = "Sessão expirada. Faça login novamente";
const INVALID_RESET_MESSAGE =
  "Link de redefinição inválido ou expirado. Peça um novo";

const TIMING_EQUALIZER_HASH =
  "$2b$12$M7XfWgsTCVU1zOSbxUcmQeu3y5jKwHqkrdCtojgvJuS4leVx4UoyS";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AuthUser["role"];
};

async function issueSession(user: SessionUser, businessId: string) {
  const refreshToken = generateRefreshToken();

  await authRepository.saveRefreshToken({
    userId: user.id,
    businessId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiresAt(),
  });

  return {
    accessToken: signAccessToken({
      userId: user.id,
      businessId,
      role: user.role,
    }),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

export const authService = {
  async register(data: RegisterInput) {
    const taken = await authRepository.findUserByEmail(data.owner.email);

    if (taken) {
      throw new AppError("Já existe uma conta com este e-mail", 409);
    }

    const passwordHash = await hashPassword(data.owner.password);

    const { business, user } = await authRepository.createBusinessWithOwner(
      data.business,
      { name: data.owner.name, email: data.owner.email, passwordHash },
    );

    const session = await issueSession(user, business.id);

    return { ...session, user, business };
  },

  async login({ email, password }: LoginInput) {
    const found = await authRepository.findUserByEmail(email);

    if (!found || !found.active) {
      await verifyPassword(password, TIMING_EQUALIZER_HASH);
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const passwordMatches = await verifyPassword(password, found.passwordHash);

    if (!passwordMatches) {
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const user = {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role,
    };

    const session = await issueSession(user, found.businessId);

    return { ...session, user, business: found.business };
  },

  async refresh(refreshToken: string) {
    const stored = await authRepository.findRefreshTokenByHash(
      hashRefreshToken(refreshToken),
    );

    if (!stored) {
      throw new AppError(INVALID_SESSION_MESSAGE, 401);
    }

    if (stored.revokedAt) {
      await authRepository.revokeAllForUser(stored.userId);
      throw new AppError(INVALID_SESSION_MESSAGE, 401);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError(INVALID_SESSION_MESSAGE, 401);
    }

    const found = await authRepository.findUserById(stored.userId);

    if (!found || !found.active) {
      throw new AppError(INVALID_SESSION_MESSAGE, 401);
    }

    await authRepository.revokeRefreshToken(stored.id);

    return issueSession(
      {
        id: found.id,
        name: found.name,
        email: found.email,
        role: found.role,
      },
      found.businessId,
    );
  },

  async logout(refreshToken: string) {
    const current = getCurrentUser();
    const stored = await authRepository.findRefreshTokenByHash(
      hashRefreshToken(refreshToken),
    );

    if (stored && stored.userId === current.userId) {
      await authRepository.revokeRefreshToken(stored.id);
    }
  },

  async forgotPassword({ email }: ForgotPasswordInput) {
    if (!env.PASSWORD_RESET_ENABLED) {
      throw new AppError("Recuperação de senha indisponível neste piloto", 503);
    }
    const found = await authRepository.findUserByEmail(email);

    if (!found || !found.active) {
      return;
    }

    await authRepository.invalidatePasswordResetTokens(found.id);

    const token = generatePasswordResetToken();

    await authRepository.createPasswordResetToken({
      userId: found.id,
      tokenHash: hashPasswordResetToken(token),
      expiresAt: passwordResetExpiresAt(),
    });

    const resetUrl = `${env.APP_URL}/redefinir-senha?token=${encodeURIComponent(token)}`;

    try {
      await mailer.send({
        to: found.email,
        ...passwordResetEmail({
          name: found.name,
          resetUrl,
          expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
        }),
      });
    } catch (error) {
      console.error("Falha ao enviar e-mail de redefinição de senha", error);
    }
  },

  async resetPassword({ token, password }: ResetPasswordInput) {
    if (!env.PASSWORD_RESET_ENABLED) {
      throw new AppError("Recuperação de senha indisponível neste piloto", 503);
    }
    const stored = await authRepository.findPasswordResetTokenByHash(
      hashPasswordResetToken(token),
    );

    if (!stored || stored.usedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError(INVALID_RESET_MESSAGE, 400);
    }

    const found = await authRepository.findUserById(stored.userId);

    if (!found || !found.active) {
      throw new AppError(INVALID_RESET_MESSAGE, 400);
    }

    const consumed = await authRepository.consumePasswordResetToken({
      tokenId: stored.id,
      userId: stored.userId,
      passwordHash: await hashPassword(password),
    });

    if (!consumed) {
      throw new AppError(INVALID_RESET_MESSAGE, 400);
    }
  },

  async me() {
    const current = getCurrentUser();
    const found = await authRepository.findUserById(current.userId);

    if (!found || !found.active || found.businessId !== current.businessId) {
      throw new AppError(INVALID_SESSION_MESSAGE, 401);
    }

    return {
      user: {
        id: found.id,
        name: found.name,
        email: found.email,
        role: found.role,
      },
      business: found.business,
    };
  },
};
