/**
 * Camera access and palm capture.
 *
 * WHY A BURST RATHER THAN A SINGLE FRAME
 *
 * A hand held over a reader is never quite still, and a rolling-shutter frame
 * caught mid-motion is soft. A soft frame does not fail loudly — it comes back
 * as a mediocre match score, which is worse, because it looks like the
 * biometrics are unreliable when really the capture was. So we take three
 * frames, measure each, and send the sharpest.
 *
 * Sharpness is the variance of the Laplacian: convolve with a 3x3 edge kernel
 * and take the variance of the response. A crisp image has strong, varied edge
 * energy; a blurred one has little. It is measured on a downscaled greyscale
 * copy so the whole burst costs a few milliseconds rather than a visible pause.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TIMINGS } from './config.js';

export type CameraStatus = 'starting' | 'ready' | 'denied' | 'missing' | 'error';

/** Downscale used for the sharpness measurement only. Never sent anywhere. */
const MEASURE_W = 256;
const MEASURE_H = 144;

const JPEG_QUALITY = 0.85;

export interface CapturedFrame {
  /** Bare base64 JPEG — the data-url prefix is stripped here, not at the call site. */
  imageB64: string;
  sharpness: number;
  bytes: number;
}

/**
 * Variance of the Laplacian over a greyscale downscale of the current frame.
 * Higher is sharper. The absolute value is meaningless across cameras; only the
 * comparison between frames of one burst matters.
 */
function measureSharpness(video: HTMLVideoElement, scratch: HTMLCanvasElement): number {
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(video, 0, 0, MEASURE_W, MEASURE_H);
  const { data } = ctx.getImageData(0, 0, MEASURE_W, MEASURE_H);

  // Rec. 601 luma, one pass.
  const grey = new Float32Array(MEASURE_W * MEASURE_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }

  // 3x3 Laplacian: centre -4, four-neighbours +1. Borders skipped.
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < MEASURE_H - 1; y += 1) {
    for (let x = 1; x < MEASURE_W - 1; x += 1) {
      const i = y * MEASURE_W + x;
      const value =
        grey[i - MEASURE_W]! + grey[i + MEASURE_W]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const fullRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<CameraStatus>('starting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setStatus('starting');

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('missing');
        else setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      // Release the camera. Without this the Pi's indicator stays lit and the
      // next screen cannot open the device.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** One frame: full-resolution JPEG plus its sharpness score. */
  const captureFrame = useCallback((): CapturedFrame | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;

    if (!scratchRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = MEASURE_W;
      canvas.height = MEASURE_H;
      scratchRef.current = canvas;
    }
    if (!fullRef.current) fullRef.current = document.createElement('canvas');

    const full = fullRef.current;
    full.width = video.videoWidth;
    full.height = video.videoHeight;
    const ctx = full.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, full.width, full.height);

    const dataUrl = full.toDataURL('image/jpeg', JPEG_QUALITY);
    const imageB64 = dataUrl.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');

    return {
      imageB64,
      sharpness: measureSharpness(video, scratchRef.current),
      // Byte size is kept as a secondary signal: a frame that encodes to almost
      // nothing is a black or blank grab regardless of what the maths says.
      bytes: Math.floor((imageB64.length * 3) / 4),
    };
  }, []);

  /**
   * Take a burst and return the sharpest frame. Rejects only if every frame
   * failed to grab — a terminal that silently sends nothing is worse than one
   * that says the camera is not ready.
   */
  const captureBest = useCallback(async (): Promise<CapturedFrame> => {
    const frames: CapturedFrame[] = [];

    for (let i = 0; i < TIMINGS.burstFrames; i += 1) {
      const frame = captureFrame();
      if (frame) frames.push(frame);
      if (i < TIMINGS.burstFrames - 1) {
        await new Promise((resolve) => setTimeout(resolve, TIMINGS.burstIntervalMs));
      }
    }

    if (frames.length === 0) throw new Error('Camera did not produce a usable frame.');

    // Discard near-empty grabs before ranking, so a black frame with freak edge
    // noise cannot win.
    const largest = Math.max(...frames.map((f) => f.bytes));
    const usable = frames.filter((f) => f.bytes > largest * 0.4);

    return (usable.length ? usable : frames).reduce((best, frame) =>
      frame.sharpness > best.sharpness ? frame : best,
    );
  }, [captureFrame]);

  return { videoRef, status, retry, captureBest };
}
