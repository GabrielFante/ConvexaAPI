import { prisma } from "../../shared/database/prisma";
import type { RegisterBusinessInput } from "./auth.schema";

const publicUserFields = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

const publicBusinessFields = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
} as const;

type OwnerRecord = {
  name: string;
  email: string;
  passwordHash: string;
};

type RefreshTokenRecord = {
  userId: string;
  businessId: string;
  tokenHash: string;
  expiresAt: Date;
};

type PasswordResetTokenRecord = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

type ConsumePasswordResetInput = {
  tokenId: string;
  userId: string;
  passwordHash: string;
};

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        ...publicUserFields,
        active: true,
        passwordHash: true,
        businessId: true,
        business: { select: publicBusinessFields },
      },
    });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserFields,
        active: true,
        businessId: true,
        business: { select: publicBusinessFields },
      },
    });
  },

  findCurrentUser(id: string, businessId: string) {
    return prisma.user.findFirst({
      where: { id, businessId },
      select: {
        ...publicUserFields,
        active: true,
        business: { select: publicBusinessFields },
      },
    });
  },

  createBusinessWithOwner(business: RegisterBusinessInput, owner: OwnerRecord) {
    return prisma.$transaction(async (tx) => {
      const createdBusiness = await tx.business.create({
        data: business,
        select: publicBusinessFields,
      });

      const createdOwner = await tx.user.create({
        data: { ...owner, businessId: createdBusiness.id, role: "OWNER" },
        select: publicUserFields,
      });

      return { business: createdBusiness, user: createdOwner };
    });
  },

  saveRefreshToken(data: RefreshTokenRecord) {
    return prisma.refreshToken.create({
      data,
      select: { id: true, userId: true, businessId: true, expiresAt: true },
    });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        businessId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  },

  revokeRefreshToken(id: string) {
    return prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  createPasswordResetToken(data: PasswordResetTokenRecord) {
    return prisma.passwordResetToken.create({
      data,
      select: { id: true, userId: true, expiresAt: true },
    });
  },

  findPasswordResetTokenByHash(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
  },

  invalidatePasswordResetTokens(userId: string) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },

  consumePasswordResetToken({
    tokenId,
    userId,
    passwordHash,
  }: ConsumePasswordResetInput) {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (consumed.count === 0) {
        return false;
      }

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return true;
    });
  },
};
