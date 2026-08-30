"use client";

import { useState } from "react";
import Link from "next/link";

// Landing / home screen (v1.11) — plays the intro banner once, then reveals
// the two main entry points (Ranking, View Slips). Ranking itself moved to
// /ranking so this route ("/") could become a pure intro screen rather than
// jumping straight into the leaderboard.
//
// Autoplay note: browsers only allow autoplay when the <video> is muted, so
// this plays muted with `playsInline` (required for iOS Safari to autoplay
// inline rather than forcing fullscreen). `onEnded` reveals the buttons.
// A "Skip intro" control is shown immediately alongside the video so a
// repeat visitor isn't forced to sit through it every time, and the buttons
// also appear if the video fails to load at all (`onError`) so a slow/broken
// video connection never strands a player without a way into the app.
export default function HomePage() {
  const [introDone, setIntroDone] = useState(false);

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-black">
        <video
          className="w-full"
          src="/intro-banner.mp4"
          autoPlay
          muted
          playsInline
          onEnded={() => setIntroDone(true)}
          onError={() => setIntroDone(true)}
        >
          Your browser doesn&apos;t support inline video playback.
        </video>
      </div>

      {!introDone && (
        <button
          type="button"
          onClick={() => setIntroDone(true)}
          className="min-h-[36px] text-sm text-white/50 underline hover:text-white/80"
        >
          Skip intro
        </button>
      )}

      {introDone && (
        <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/ranking"
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-md bg-accent px-6 text-base font-semibold text-background hover:brightness-110"
          >
            Ranking
          </Link>
          <Link
            href="/bets"
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-md border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10"
          >
            View Slips
          </Link>
        </div>
      )}
    </div>
  );
}
