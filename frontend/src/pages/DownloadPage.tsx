import { useMemo, useState } from "react";

const APK_URL = "https://king11pro.live/app/king11pro.apk";

export default function DownloadPage() {
  const [downloadClicks, setDownloadClicks] = useState(0);
  const [copied, setCopied] = useState(false);

  const helperText = useMemo(() => {
    if (downloadClicks === 0) return "Ready for instant install on Android";
    if (downloadClicks === 1) return "Download started. Open the file after it finishes.";
    return `Downloads started ${downloadClicks} times`;
  }, [downloadClicks]);

  const handleDownloadClick = () => {
    setDownloadClicks((prev) => prev + 1);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(APK_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/ipl-image.png')" }}
    >
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-3xl border border-white/35 bg-white/14 p-6 text-white backdrop-blur-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200">
            King11Pro App
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">
            Download Now
          </h1>
          <p className="mt-3 text-sm text-white/90 sm:text-base">
            Install the latest King11Pro APK and start playing fantasy cricket with live scores and fast joins.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href={APK_URL}
              onClick={handleDownloadClick}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/30 transition hover:-translate-y-0.5 hover:bg-orange-400 active:translate-y-0"
              rel="noreferrer"
            >
              Download APK
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center rounded-xl border border-white/45 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {copied ? "Link Copied" : "Copy Download Link"}
            </button>
          </div>

          <div className="mt-6 rounded-xl border border-white/30 bg-black/20 p-3 text-sm">
            <p className="font-semibold text-orange-100">{helperText}</p>
            <p className="mt-1 text-xs text-white/85">
              If prompted, allow installation from unknown sources in your Android settings.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
