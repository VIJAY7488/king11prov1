import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { SeoHead } from "./SeoHead";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  ORGANIZATION_SCHEMA,
  WEBSITE_SCHEMA,
  makeWebPageSchema,
} from "./seo";

type RouteSeoConfig = {
  title: string;
  description: string;
  noIndex?: boolean;
};

function getRouteSeo(pathname: string): RouteSeoConfig {
  if (pathname === "/") {
    return {
      title: "King11Pro - Play Fantasy Cricket With Live Leaderboards",
      description:
        "Build your Dream XI, join contests, and watch live fantasy points update ball-by-ball on King11Pro.",
    };
  }

  if (pathname === "/matches") {
    return {
      title: "Upcoming & Live Cricket Matches | King11Pro",
      description:
        "Browse upcoming and live cricket matches, then create teams and enter fantasy contests on King11Pro.",
    };
  }

  if (pathname.startsWith("/matches/")) {
    return {
      title: "Match Details & Contest Entry | King11Pro",
      description:
        "View match details, contest options, and team-building flow for fantasy cricket contests on King11Pro.",
    };
  }

  if (pathname === "/contests") {
    return {
      title: "Fantasy Cricket Contests | King11Pro",
      description:
        "Join free and paid fantasy contests, compare entry fees, and compete for leaderboard ranks on King11Pro.",
    };
  }

  if (pathname === "/download") {
    return {
      title: "Download King11Pro App APK",
      description:
        "Download the official King11Pro Android APK and install the fantasy cricket app on your device.",
    };
  }

  if (pathname.startsWith("/contests/") && pathname.endsWith("/live")) {
    return {
      title: "Live Contest Leaderboard | King11Pro",
      description:
        "Track live contest rankings and fantasy points in real time during ongoing cricket matches.",
      noIndex: true,
    };
  }

  if (pathname === "/profile") {
    return {
      title: "My Profile | King11Pro",
      description: "Manage your profile, wallet activity, and account preferences.",
      noIndex: true,
    };
  }

  if (pathname === "/teams") {
    return {
      title: "My Teams | King11Pro",
      description: "Create, edit, and manage your fantasy cricket teams.",
      noIndex: true,
    };
  }

  if (pathname === "/joined-contests") {
    return {
      title: "Joined Contests | King11Pro",
      description: "View all contests you have joined and monitor your progress.",
      noIndex: true,
    };
  }

  if (pathname === "/transactions") {
    return {
      title: "Wallet Transactions | King11Pro",
      description: "Track deposits, withdrawals, and winnings in your wallet.",
      noIndex: true,
    };
  }

  if (pathname === "/login") {
    return {
      title: "Login | King11Pro",
      description: "Login to your King11Pro account.",
      noIndex: true,
    };
  }

  if (pathname === "/signup") {
    return {
      title: "Sign Up | King11Pro",
      description: "Create your King11Pro account and start playing fantasy contests.",
      noIndex: true,
    };
  }

  if (pathname.startsWith("/admin")) {
    return {
      title: "Admin | King11Pro",
      description: "Admin management portal.",
      noIndex: true,
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    noIndex: true,
  };
}

export function RouteSeo() {
  const location = useLocation();

  const seo = useMemo(() => getRouteSeo(location.pathname), [location.pathname]);

  const jsonLd = useMemo(() => {
    if (seo.noIndex) return null;

    return {
      "@context": "https://schema.org",
      "@graph": [
        ORGANIZATION_SCHEMA,
        WEBSITE_SCHEMA,
        makeWebPageSchema({
          name: seo.title,
          description: seo.description,
          pathname: location.pathname,
        }),
      ],
    };
  }, [location.pathname, seo.description, seo.noIndex, seo.title]);

  return (
    <SeoHead
      title={seo.title}
      description={seo.description}
      pathname={location.pathname}
      noIndex={!!seo.noIndex}
      jsonLd={jsonLd}
    />
  );
}
