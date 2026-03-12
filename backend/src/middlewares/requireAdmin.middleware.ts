import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';
import User, { UserRole } from '../mdules/user/users.model';


/**
 * Must be used AFTER authenticate middleware.
 *
 * WHY WE HIT THE DB HERE:
 * The role is embedded in the JWT for performance — but this means if someone's
 * role is changed in the DB (e.g. USER → ADMIN via mongo shell), their existing
 * token still carries the old role. To make role changes take effect immediately
 * we do a single lightweight DB query here instead of trusting the JWT role.
 *
 * This query only fetches { role, isActive } — it is fast and indexed on _id.
 *
 * The JWT still handles authentication (who you are) — the DB handles
 * authorisation (what you're allowed to do right now).
 */
const requireAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  try {
    // Fetch only the fields we need — no password, no wallet, just role + status
    const user = await User.findById(req.user.id).select('role isActive');

    if (!user) {
      return next(new AppError('User not found.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Account is deactivated.', 403));
    }

    if (user.role !== UserRole.ADMIN) {
      return next(new AppError('Access denied. Admin privileges required.', 403));
    }

    // Update req.user.role to reflect the live DB value
    // so downstream handlers always see the current role
    req.user.role = user.role;

    next();
  } catch (err) {
    next(err);
  }
};

export default requireAdmin;