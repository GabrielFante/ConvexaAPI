import type { Request, Response } from "express";
import { authService } from "./auth.service";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schema";

export const authController = {
  async register(req: Request, res: Response) {
    const data = registerSchema.parse(req.body);
    const session = await authService.register(data);
    res.status(201).json(session);
  },

  async login(req: Request, res: Response) {
    const data = loginSchema.parse(req.body);
    const session = await authService.login(data);
    res.json(session);
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);
    const session = await authService.refresh(refreshToken);
    res.json(session);
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  },

  async forgotPassword(req: Request, res: Response) {
    const data = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(data);
    res.status(204).send();
  },

  async resetPassword(req: Request, res: Response) {
    const data = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(data);
    res.status(204).send();
  },

  async me(_req: Request, res: Response) {
    const profile = await authService.me();
    res.json(profile);
  },
};
