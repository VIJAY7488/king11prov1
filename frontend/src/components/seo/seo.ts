const DEFAULT_SITE_URL = "https://king11pro.live";

export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? DEFAULT_SITE_URL).replace(/\/$/, "");
export const SITE_NAME = "King11Pro";
export const DEFAULT_TITLE = "King11Pro - Fantasy Cricket Contests & Live Rankings";
export const DEFAULT_DESCRIPTION = "Join fantasy cricket contests, build your Dream XI, track live points, and climb real-time leaderboards on King11Pro.";

export function toAbsoluteUrl(pathname: string): string {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE_URL}${cleanPath}`;
}

export function makeWebPageSchema(input: {
  name: string;
  description: string;
  pathname: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url: toAbsoluteUrl(input.pathname),
    inLanguage: "en-IN",
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.svg`,
};

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "en-IN",
};
