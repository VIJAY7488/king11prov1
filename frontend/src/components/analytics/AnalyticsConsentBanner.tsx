import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  analyticsAvailable,
  getAnalyticsConsent,
  initializeAnalytics,
  setAnalyticsConsent,
  trackPageView,
} from "@/lib/analytics";

export function AnalyticsConsentBanner() {
  const location = useLocation();
  const [consentSet, setConsentSet] = useState<boolean>(true);

  useEffect(() => {
    if (!analyticsAvailable()) {
      setConsentSet(true);
      return;
    }
    setConsentSet(getAnalyticsConsent() !== null);
  }, []);

  const hidden = useMemo(() => {
    if (!analyticsAvailable() || consentSet) return true;
    return location.pathname.startsWith("/admin");
  }, [consentSet, location.pathname]);

  if (hidden) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[80] md:left-auto md:max-w-xl bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl shadow-[0_16px_40px_rgba(26,18,8,.12)] p-4">
      <p className="text-sm font-semibold text-[#1A1208] mb-1">Analytics Consent</p>
      <p className="text-xs text-[#7A6A55] mb-3">
        We use Google Analytics to improve product performance. No personal details are sent.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => {
            setAnalyticsConsent("granted");
            initializeAnalytics();
            trackPageView(`${location.pathname}${location.search}`);
            setConsentSet(true);
          }}
          className="px-4 py-2 rounded-xl bg-[#EA4800] text-white text-sm font-bold hover:bg-[#FF5A1A] transition-colors"
        >
          Accept
        </button>
        <button
          onClick={() => {
            setAnalyticsConsent("denied");
            setConsentSet(true);
          }}
          className="px-4 py-2 rounded-xl border-[1.5px] border-[#E8E0D4] text-sm font-bold text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800] transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
