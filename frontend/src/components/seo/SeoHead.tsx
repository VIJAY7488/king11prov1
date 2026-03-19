import { useEffect } from "react";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_NAME,
  toAbsoluteUrl,
} from "./seo";

type SeoHeadProps = {
  title?: string;
  description?: string;
  pathname: string;
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | null;
};

function setOrCreateMetaByName(name: string, content: string) {
  let el = document.head.querySelector(`meta[name=\"${name}\"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setOrCreateMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector(`meta[property=\"${property}\"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setOrCreateCanonical(url: string) {
  let link = document.head.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function setOrCreateJsonLd(id: string, data: Record<string, unknown> | null) {
  const existing = document.getElementById(id);
  if (!data) {
    if (existing) existing.remove();
    return;
  }

  let script = existing as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function SeoHead({
  title,
  description,
  pathname,
  noIndex = false,
  jsonLd = null,
}: SeoHeadProps) {
  useEffect(() => {
    const safeTitle = title?.trim() || DEFAULT_TITLE;
    const safeDescription = description?.trim() || DEFAULT_DESCRIPTION;
    const canonical = toAbsoluteUrl(pathname);
    const robots = noIndex ? "noindex, nofollow" : "index, follow";

    document.title = safeTitle;

    setOrCreateMetaByName("description", safeDescription);
    setOrCreateMetaByName("robots", robots);
    setOrCreateMetaByProperty("og:type", "website");
    setOrCreateMetaByProperty("og:site_name", SITE_NAME);
    setOrCreateMetaByProperty("og:title", safeTitle);
    setOrCreateMetaByProperty("og:description", safeDescription);
    setOrCreateMetaByProperty("og:url", canonical);
    setOrCreateMetaByName("twitter:card", "summary_large_image");
    setOrCreateMetaByName("twitter:title", safeTitle);
    setOrCreateMetaByName("twitter:description", safeDescription);
    setOrCreateCanonical(canonical);

    setOrCreateJsonLd("seo-jsonld-page", jsonLd);
  }, [title, description, pathname, noIndex, jsonLd]);

  return null;
}
