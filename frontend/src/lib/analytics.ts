export type AnalyticsConsent = "granted" | "denied";

const CONSENT_KEY = "king11pro-analytics-consent";
const GA_SCRIPT_ID = "ga4-script";
const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
const allowInDev = import.meta.env.VITE_GA_ENABLE_IN_DEV === "true";
const envAllowsTracking = !!measurementId && (import.meta.env.PROD || allowInDev);

let initialized = false;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

function readStoredConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  if (value === "granted" || value === "denied") return value;
  return null;
}

function pushGtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

function shouldTrackCurrentPath(path: string): boolean {
  return !path.startsWith("/admin");
}

export function analyticsAvailable(): boolean {
  return envAllowsTracking;
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  return readStoredConsent();
}

export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, consent);
}

export function analyticsCanTrack(): boolean {
  return envAllowsTracking && readStoredConsent() === "granted";
}

export function initializeAnalytics(): void {
  if (!analyticsCanTrack() || initialized || typeof window === "undefined") return;

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => pushGtag(...args);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    anonymize_ip: true,
  });

  initialized = true;
}

export function trackPageView(path: string, title = document.title): void {
  if (!analyticsCanTrack() || !shouldTrackCurrentPath(path) || typeof window === "undefined") return;
  initializeAnalytics();
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: window.location.href,
  });
}

export function trackEvent(eventName: string, params: Record<string, unknown> = {}): void {
  if (!analyticsCanTrack() || typeof window === "undefined") return;
  if (!shouldTrackCurrentPath(window.location.pathname)) return;
  initializeAnalytics();

  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  );
  window.gtag("event", eventName, cleanParams);
}
