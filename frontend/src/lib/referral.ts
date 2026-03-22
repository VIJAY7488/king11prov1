const SITE_URL = import.meta.env.VITE_SITE_URL?.trim();

const normalizeOrigin = (raw: string): string => {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return window.location.origin;
  }
};

export function buildReferralLink(referralCode: string): string {
  const code = referralCode.trim().toUpperCase();
  if (!code) return "";
  const origin = SITE_URL ? normalizeOrigin(SITE_URL) : window.location.origin;
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/signup?ref=${encodeURIComponent(code)}`;
}
