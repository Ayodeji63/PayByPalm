/**
 * Landing — page 1 of 4.
 *
 * A full-bleed blue panel with the pitch and a single way forward. Anyone who
 * already has a session never sees it; App.tsx sends them straight to the
 * dashboard.
 */

import { useNavigate } from 'react-router-dom';
import { PalmIcon, Wordmark } from '../components/ui.js';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-accent px-7 pt-14 pb-10 text-white">
      <Wordmark className="text-center text-2xl" />

      <div className="mt-16">
        {/* Decorative quote mark, as in the reference. */}
        <svg width="34" height="26" viewBox="0 0 34 26" fill="none" aria-hidden="true" className="opacity-40">
          <path
            d="M0 26V15.6C0 6.9 4.6 1.7 13.6 0l1.6 4.6c-4.9 1.4-7.4 4.3-7.4 8.7H14V26H0Zm19 0V15.6C19 6.9 23.6 1.7 32.6 0l1.6 4.6c-4.9 1.4-7.4 4.3-7.4 8.7H33V26H19Z"
            fill="currentColor"
          />
        </svg>

        <h1 className="mt-5 text-[34px] leading-[1.15] font-bold tracking-tight">
          Pay with your palm,
          <br />
          leave your phone
          <br />
          behind
        </h1>

        <p className="mt-4 max-w-[19rem] text-[15px] leading-relaxed text-white/75">
          Link your palm once at any campus terminal. After that, your hand is all you need — no
          phone, no card, no PIN.
        </p>
      </div>

      {/* Static progress dots: this is a one-screen intro, and pretending
          otherwise would promise a carousel that does not exist. */}
      <div className="mt-8 flex gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-5 rounded-full bg-white" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
      </div>

      {/* The mark fills the lower half the way the reference uses a photo, with
          the call to action overlapping its edge. */}
      <div className="relative mt-auto flex min-h-[260px] items-end justify-between">
        <PalmIcon className="absolute -bottom-6 -left-8 h-72 w-72 text-white/20" />

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="relative ml-auto mb-8 flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white text-center text-sm font-bold leading-tight text-accent transition-transform active:scale-95"
        >
          Start
          <br />
          Now
        </button>
      </div>
    </div>
  );
}
