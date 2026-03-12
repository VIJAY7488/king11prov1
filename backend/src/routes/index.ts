import { Router } from 'express';
import userRouter    from '../mdules/user/users.routes';
import depositRouter from '../mdules/deposit/deposit.routes';
import walletRouter  from '../mdules/wallet/wallet.routes';
import contestRouter from '../mdules/contest/contest.routes';
import teamRouter    from '../mdules/team/team.routes';
import matchRouter   from '../mdules/match/match.routes';
import scoreRouter   from '../mdules/scores/score.routes';
import withdrawalRouter from '../mdules/withdrawal/withdrawal.routes';

const router = Router();

// ── User / Auth ───────────────────────────────────────────────────────────────
router.use('/users', userRouter);

// ── Deposits & Wallet ────────────────────────────────────────────────────────
router.use('/users', depositRouter);
router.use('/users/wallet', walletRouter);
router.use('/users', withdrawalRouter);

// ── Contests ─────────────────────────────────────────────────────────────────
router.use('/', contestRouter);   // GET /contests (public) + admin CRUD under /admin/
router.use('/users', contestRouter);  // Also mount at /users for user actions like join-contest

// ── Teams ────────────────────────────────────────────────────────────────────
router.use('/users', teamRouter);

// ── Matches ──────────────────────────────────────────────────────────────────
router.use('/', matchRouter);   // GET /matches, GET /matches/live, admin POST/PATCH

// ── Scores & Leaderboard ──────────────────────────────────────────────────────
router.use('/', scoreRouter);   // POST /scores/ball, GET /scores/match/:id, etc.

export default router;
