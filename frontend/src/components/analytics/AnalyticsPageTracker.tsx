import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initializeAnalytics, trackPageView } from "@/lib/analytics";

export function AnalyticsPageTracker() {
  const location = useLocation();

  useEffect(() => {
    initializeAnalytics();
    const path = `${location.pathname}${location.search}`;
    trackPageView(path);
  }, [location.pathname, location.search]);

  return null;
}
