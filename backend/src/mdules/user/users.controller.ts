import { Request, Response } from 'express';
import asyncHandler from "../../utils/asyncHandler";
import usersService from './users.service';
import AppError from '../../utils/AppError';
import { authCookieNames, clearAuthCookies, setAuthCookies } from '../../utils/authCookies';

export class UserController {
    // ── Auth ──────────────────────────────────────────────────────────────────
    register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const result = await usersService.register(req.body);
        setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

        res.status(201).json({
            status: 'success',
            message: 'Account created successfully.',
            data: result,
        });
    });

    login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const result = await usersService.login(req.body);
        setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
        res.status(200).json({
            status: 'success',
            message: 'Login successful.',
            data: result,
        });
    });

    refreshTokens = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const refreshToken = req.body?.refreshToken || req.cookies?.[authCookieNames.refresh];
        if (!refreshToken) {
            throw new AppError('Refresh token is required.', 401);
        }
        const tokens = await usersService.refreshTokens(refreshToken);
        setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
        res.status(200).json({
            status: 'success',
            message: 'Tokens refreshed.',
            data: { tokens },
        });
    });

    logout = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
        clearAuthCookies(res);
        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully.',
        });
    });


    // ── Profile ───────────────────────────────────────────────────────────────

    getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const profile = await usersService.getProfile(req.user!.id);
        res.status(200).json({
            status: 'success',
            data: { user: profile },
        })
    });

    updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const updated = await usersService.updateProfile(req.user!.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Profile updated.',
            data: { user: updated },
        })
    });

    changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        await usersService.changePassword(req.user!.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Password changed successfully.',
        })
    });
};

export default new UserController;
