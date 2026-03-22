const SITE_URL = import.meta.env.VITE_SITE_URL?.trim();

export function buildReferralLink(referralCode: string): string {
  const code = referralCode.trim().toUpperCase();
  if (!code) return "";
  const origin = SITE_URL || window.location.origin;
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/signup?ref=${encodeURIComponent(code)}`;
}
