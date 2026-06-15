import type { RequestHandler } from "express";
import { prisma } from "../database/prisma";
import { AppError } from "../errors/AppError";
import { runWithTenant } from "../tenant/tenant-context";

export const tenantMiddleware: RequestHandler = async (req, _res, next) => {
  const businessId = req.header("x-business-id");

  if (!businessId) {
    throw new AppError("Header x-business-id é obrigatório", 400);
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });

  if (!business) {
    throw new AppError("Empresa (tenant) não encontrada", 404);
  }

  runWithTenant(business.id, () => next());
};
