/**
 * Landing — 3-slide onboarding carousel.
 *
 * Matches the design reference: deep blue gradient, grid pattern,
 * PayByPalm logo at top, quote marks, headline + subtitle,
 * large student photo at bottom-left blending into the gradient,
 * circular "Get Started" CTA, and interactive page dots.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Slide {
  headline: string;
  subtitle: string;
  image: string;
}

const SLIDES: Slide[] = [
  {
    headline: 'Pay With Your Palm,\nEmpower Your Life',
    subtitle:
      'Deploy our terminals in any area of your organisation — banks, markets, cafeterias — and let customers pay with just their palm.',
    image: '/images/onboard-1.jpg',
  },
  {
    headline: 'Tap, Scan, Done.\nPayments Made Easy',
    subtitle:
      'Hold your palm over any campus terminal. Instant verification, instant payment — no cards needed.',
    image: '/images/onboard-2.jpg',
  },
  {
    headline: 'Your Money,\nAlways Secure',
    subtitle:
      'Bank-grade encryption protects every transaction. Works with POS terminal agents and kiosks — your palm is the only password you need.',
    image: '/images/onboard-3.jpg',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoPlayRef = useRef<number | null>(null);

  const slide = SLIDES[current]!;

  // Auto-advance every 5 seconds
  useEffect(() => {
    autoPlayRef.current = window.setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [current]);

  const goTo = useCallback((index: number) => {
    setCurrent(index);
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
  }, []);

  // Touch swipe handling
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const onTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 50 && current < SLIDES.length - 1) goTo(current + 1);
    else if (diff < -50 && current > 0) goTo(current - 1);
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden text-white"
      style={{ background: 'linear-gradient(to bottom, #2851c5, #1a3a9e)' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(255,255,255,0.5) 28px, rgba(255,255,255,0.5) 29px),
            repeating-linear-gradient(90deg, transparent, transparent 28px, rgba(255,255,255,0.5) 28px, rgba(255,255,255,0.5) 29px)
          `,
        }}
      />

      {/* Top — Logo icon + wordmark */}
      <div className="relative z-10 flex flex-col items-center pt-12 pb-2">
        <img
          src="/images/logo-white.jpg"
          alt="PayByPalm"
          className="h-16 w-16 rounded-2xl"
          style={{ mixBlendMode: 'multiply' }}
        />
        <h1 className="mt-2 text-xl font-bold tracking-tight">PayByPalm</h1>
      </div>

      {/* Centre — Headline content */}
      <div className="relative z-10 px-8 text-center">
        {/* Quote mark */}
        <div className="mb-2 text-5xl font-bold leading-none opacity-70">"</div>

        <h2
          key={`h-${current}`}
          className="animate-fade-in text-[28px] font-extrabold leading-[1.15] tracking-tight whitespace-pre-line"
        >
          {slide.headline}
        </h2>

        <p
          key={`p-${current}`}
          className="animate-fade-in mx-auto mt-4 max-w-[300px] text-[15px] leading-relaxed opacity-75"
        >
          {slide.subtitle}
        </p>
      </div>

      {/* Bottom — Large student photo + CTA + dots */}
      <div className="relative z-10 flex-1 flex flex-col justify-end">
        {/* Student image — big, blends into background */}
        <div className="relative h-[480px]">
          <img
            key={`img-${current}`}
            src={slide.image}
            alt=""
            className="animate-fade-in absolute bottom-0 -left-6 h-full w-[70%] object-cover object-top"
            style={{
              mixBlendMode: 'multiply',
              maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
            }}
          />

          {/* Concentric ring arcs — decorative */}
          {/* Concentric rings + button — rings centered on the button */}
          <div className="absolute bottom-16 right-4 flex items-center justify-center">
            {/* Rings behind the button */}
            <div className="absolute h-[200px] w-[200px] rounded-full border border-white/[0.08]" />
            <div className="absolute h-[280px] w-[280px] rounded-full border border-white/[0.05]" />

            {/* Get Started button — fits inside inner ring */}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="relative z-10 flex h-[100px] w-[100px] flex-col items-center justify-center rounded-full bg-white text-[#1a3a9e] shadow-2xl transition-transform hover:scale-105 active:scale-95"
            >
              <span className="text-[13px] font-bold leading-tight">Get Started</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Page dots */}
        <div className="flex justify-center gap-2.5 pb-8 pt-3">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                i === current
                  ? 'w-7 bg-white'
                  : 'w-2.5 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
