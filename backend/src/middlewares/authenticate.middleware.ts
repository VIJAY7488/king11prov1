import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError';
import config from '../config/env';
import { JwtPayload } from '../mdules/user/users.types';
import { authCookieNames } from '../utils/authCookies';


const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const cookieToken = req.cookies?.[authCookieNames.access];
    const token = bearerToken || cookieToken;

    if (!token) {
        return next(new AppError('Authorization token missing.', 401));
    }

    try {
        const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
        req.user = { id: payload.sub, mobile: payload.mobile, role: payload.role };
        next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return next(new AppError('Access token has expired.', 401));
        }
        return next(new AppError('Invalid access token.', 401));
    }
};

export default authenticate;
