import { Router } from "express";
import { authController } from "./auth.controller";

export const authPublicRoutes = Router();

authPublicRoutes.post("/register", authController.register);
authPublicRoutes.post("/login", authController.login);
authPublicRoutes.post("/refresh", authController.refresh);
authPublicRoutes.post("/forgot-password", authController.forgotPassword);
authPublicRoutes.post("/reset-password", authController.resetPassword);

export const authPrivateRoutes = Router();

authPrivateRoutes.get("/me", authController.me);
authPrivateRoutes.post("/logout", authController.logout);
