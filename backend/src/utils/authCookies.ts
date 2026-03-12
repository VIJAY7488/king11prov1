import type { Response } from "express";
import type { CookieOptions } from "express";
import config from "../config/env";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

const durationToMs = (value: string, fallbackMs: number): number => {
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return fallbackMs;
  const amount = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "s") return amount * 1_000;
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  return amount * 86_400_000;
};

const baseCookieOptions = (): CookieOptions => {
  const isProd = config.nodeEnv === "production";
  const opts: CookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  };
  if (config.cookieDomain.trim()) {
    opts.domain = config.cookieDomain.trim();
  }
  return opts;
};

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(),
    maxAge: durationToMs(config.jwtExpiresIn, 7 * 24 * 60 * 60 * 1_000),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    maxAge: durationToMs(config.jwtRefreshExpiresIn, 30 * 24 * 60 * 60 * 1_000),
  });
};

export const clearAuthCookies = (res: Response): void => {
  const opts = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
};

export const authCookieNames = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
} as const;
