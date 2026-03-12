import { Router } from "express";
import { changePasswordSchema, loginSchema, refreshTokenSchema, registerSchema, updateProfileSchema } from "./users.validator";
import usersController from "./users.controller";
import validate from "../../middlewares/validate.middleware";
import authenticate from "../../middlewares/authenticate.middleware";

const router = Router();

// ── Public Routes (no auth required) ─────────────────────────────────────────
router.post('/register', validate(registerSchema), usersController.register);
router.post('/login',    validate(loginSchema),    usersController.login);
router.post('/refresh',  validate(refreshTokenSchema), usersController.refreshTokens);
router.post('/logout',   usersController.logout);


// ── Protected Routes (JWT required) ──────────────────────────────────────────
router.use(authenticate);

router.get('/me', usersController.getProfile);
router.patch('/me',  validate(updateProfileSchema), usersController.updateProfile);
router.post('/me/change-password', validate(changePasswordSchema), usersController.changePassword);
export default router;
