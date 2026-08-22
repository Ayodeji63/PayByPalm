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

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { TIMINGS } from './config.js';

export type CameraStatus = 'starting' | 'ready' | 'denied' | 'missing' | 'error';

/** Downscale used for the sharpness measurement only. Never sent anywhere. */
const MEASURE_W = 256;
const MEASURE_H = 144;

const JPEG_QUALITY = 0.85;

const LANDMARK_INTERVAL_MS = 180;
const STABLE_LANDMARK_DELTA = 0.009;
const STABLE_LANDMARK_FRAMES = 6;
const MEDIAPIPE_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type AutoCaptureState =
  | 'loading'
  | 'place'
  | 'position'
  | 'open'
  | 'moving'
  | 'ready'
  | 'error';
export type HandLandmark = NormalizedLandmark;

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
    let timedOut = false;
    setStatus('starting');

    // PipeWire can leave getUserMedia pending forever when stream negotiation
    // fails. Surface a retryable error instead of trapping the kiosk on its
    // starting screen.
    const startupTimer = window.setTimeout(() => {
      if (cancelled) return;
      timedOut = true;
      setStatus('error');
    }, 12_000);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            // This is the configuration already proven to negotiate correctly
            // through Chromium + PipeWire on the PayByPalm Raspberry Pi.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        window.clearTimeout(startupTimer);
        if (cancelled || timedOut) {
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
        window.clearTimeout(startupTimer);
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('missing');
        else setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
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

/** Detects and validates one open palm using MediaPipe's 21 hand landmarks. */
export function useAutoCapture(
  videoRef: RefObject<HTMLVideoElement>,
  active: boolean,
): { state: AutoCaptureState; landmarks: HandLandmark[] } {
  const [state, setState] = useState<AutoCaptureState>('loading');
  const [landmarks, setLandmarks] = useState<HandLandmark[]>([]);

  useEffect(() => {
    if (!active) {
      setState('loading');
      setLandmarks([]);
      return;
    }

    let stopped = false;
    let landmarker: HandLandmarker | null = null;
    let timer: number | undefined;
    let previous: HandLandmark[] | null = null;
    let stableCount = 0;

    const distance = (a: HandLandmark, b: HandLandmark) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const sample = () => {
      const video = videoRef.current;
      if (!video || !landmarker || video.readyState < 2 || !video.videoWidth) return;

      const hands = landmarker.detectForVideo(video, performance.now()).landmarks;
      const hand = hands[0];
      if (hands.length !== 1 || !hand || hand.length !== 21) {
        stableCount = 0;
        previous = null;
        setLandmarks([]);
        setState('place');
        return;
      }

      setLandmarks(hand);
      const xs = hand.map((point) => point.x);
      const ys = hand.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const height = maxY - minY;
      const centred = (minX + maxX) / 2 > 0.28 && (minX + maxX) / 2 < 0.72;
      const fullyVisible = minX > 0.025 && maxX < 0.975 && minY > 0.025 && maxY < 0.975;
      const sized = width > 0.22 && width < 0.88 && height > 0.38 && height < 0.95;
      if (!centred || !fullyVisible || !sized) {
        stableCount = 0;
        previous = hand;
        setState('position');
        return;
      }

      const wrist = hand[0]!;
      const extended = [
        [4, 2, 1.15],
        [8, 6, 1.12],
        [12, 10, 1.12],
        [16, 14, 1.1],
        [20, 18, 1.08],
      ] as const;
      const palmOpen = extended.every(
        ([tip, joint, ratio]) =>
          distance(wrist, hand[tip]!) > distance(wrist, hand[joint]!) * ratio,
      );
      if (!palmOpen) {
        stableCount = 0;
        previous = hand;
        setState('open');
        return;
      }

      const motion = previous
        ? hand.reduce((sum, point, index) => sum + distance(point, previous![index]!), 0) /
          hand.length
        : Number.POSITIVE_INFINITY;
      previous = hand;
      stableCount = motion < STABLE_LANDMARK_DELTA ? stableCount + 1 : 0;
      setState(stableCount >= STABLE_LANDMARK_FRAMES ? 'ready' : 'moving');
    };

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        if (stopped) return;
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.65,
          minHandPresenceConfidence: 0.65,
          minTrackingConfidence: 0.6,
        });
        if (stopped) {
          landmarker.close();
          return;
        }
        setState('place');
        timer = window.setInterval(sample, LANDMARK_INTERVAL_MS);
      } catch {
        if (!stopped) setState('error');
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      landmarker?.close();
    };
  }, [active, videoRef]);

  return { state, landmarks };
}
