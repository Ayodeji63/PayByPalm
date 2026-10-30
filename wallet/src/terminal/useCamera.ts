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
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { getPalmTracker, type PalmTracker } from './palmTracker.js';
import { leaseCamera } from './cameraStream.js';
import { TIMINGS } from './config.js';
import { captureWithLight, type LEDOperation } from './leds.js';

export type CameraStatus = 'starting' | 'ready' | 'denied' | 'missing' | 'error';

/** Downscale used for the sharpness measurement only. Never sent anywhere. */
const MEASURE_W = 256;
const MEASURE_H = 144;

const JPEG_QUALITY = 0.85;

// Placement guidance uses a reduced preview in a worker; capture stays full-resolution.
const LANDMARK_INTERVAL_MS = 100;
const STABLE_LANDMARK_DELTA = 0.009;
const STABLE_LANDMARK_FRAMES = 3;
const STABLE_DURATION_MS = 300;
export function preloadPalmRecognition():void{
 try{void getPalmTracker().initialize().catch(()=>undefined);}catch{/* Manual capture remains available. */}
}

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
  const [illuminationWarning,setIlluminationWarning]=useState<string|null>(null);
  const capturingRef=useRef(false);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const lease = leaseCamera();
    let timedOut = false;
    setStatus('starting');

    // PipeWire can leave getUserMedia pending forever when stream negotiation
    // fails. Surface a retryable error instead of trapping the kiosk on its
    // starting screen.
    const startupTimer = window.setTimeout(() => {
      if (cancelled) return;
      timedOut = true;
      setStatus('error');
      lease.release();
    }, 12_000);

    (async () => {
      try {
        const stream = await lease.ready;

        window.clearTimeout(startupTimer);
        if (cancelled || timedOut) {
          lease.release();
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
        lease.release();
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
      lease.release();
      if (videoRef.current) videoRef.current.srcObject = null;
      if (fullRef.current) { fullRef.current.width = 0; fullRef.current.height = 0; }
      if (scratchRef.current) { scratchRef.current.width = 0; scratchRef.current.height = 0; }
      scratchRef.current = null; fullRef.current = null;
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
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    full.width = Math.round(video.videoWidth * scale);
    full.height = Math.round(video.videoHeight * scale);
    const ctx = full.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, full.width, full.height);

    let quality = JPEG_QUALITY;
    let imageB64 = '';
    do { imageB64 = full.toDataURL('image/jpeg', quality).split(',')[1] ?? ''; quality -= 0.1; }
    while (imageB64.length * 3 / 4 > 512 * 1024 && quality >= 0.35);
    if (!imageB64 || imageB64.length * 3 / 4 > 512 * 1024) throw new Error('The capture is too large. Please try again.');

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
  const captureBurst = useCallback(async (leds:LEDOperation, progress?: (count: number) => void): Promise<CapturedFrame[]> => {
    const started = performance.now();
    if(capturingRef.current)throw new Error('Palm capture is already in progress.');
    capturingRef.current=true;
    setIlluminationWarning(null);
    try {
    const frames=await captureWithLight(leds,async()=>{
      const captured:CapturedFrame[]=[];
      try { for(let i=0;i<TIMINGS.burstFrames;i++){
        if(!leds.active())throw new Error('Palm capture was cancelled.');
        const frame=captureFrame();if(frame)captured.push(frame);
        progress?.(captured.length);
        if(i<TIMINGS.burstFrames-1)await new Promise(resolve=>setTimeout(resolve,TIMINGS.burstIntervalMs));
      }
      } catch (error) { captured.forEach(frame => { frame.imageB64 = ''; }); throw error; }
      return captured;
    },TIMINGS.ledExposureSettleMs,setIlluminationWarning);

    if (frames.length !== 3 || new Set(frames.map(frame => frame.imageB64)).size !== 3) {
      frames.forEach(frame => { frame.imageB64 = ''; });
      throw new Error('The camera did not deliver three fresh frames. Hold still and try again.');
    }
    performance.measure('palm.capture', { start: started, end: performance.now() });
    return frames;
    }finally{capturingRef.current=false; if(fullRef.current) { fullRef.current.width=0; fullRef.current.height=0; }}
  }, [captureFrame]);

  const captureBest = useCallback(async (leds: LEDOperation): Promise<CapturedFrame> => {
    const frames = await captureBurst(leds);
    const largest = Math.max(...frames.map(frame => frame.bytes));
    const usable = frames.filter(frame => frame.bytes > largest * 0.4);
    const best = (usable.length ? usable : frames).reduce((a, b) => a.sharpness > b.sharpness ? a : b);
    frames.forEach(frame => { if (frame !== best) frame.imageB64 = ''; });
    return best;
  }, [captureBurst]);
  return { videoRef, status, retry, captureBest, captureBurst, illuminationWarning };
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
    let landmarker: PalmTracker | null = null;
    let timer: number | undefined;
    let previous: HandLandmark[] | null = null;
    let stableCount = 0;
    let stableSince = 0;
    let readyMarked = false;
    let previousAt = 0;

    const distance = (a: HandLandmark, b: HandLandmark) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const sample = async () => {
      const video = videoRef.current;
      if (!video || !landmarker || video.readyState < 2 || !video.videoWidth) return;

      let hands: HandLandmark[][];
      try {
        const result=await landmarker.detect(video);
        if(stopped||result===null)return;
        hands=result;
      } catch {
        // ML is an enhancement, never a reason to take down the camera. Leave
        // manual capture available if a frame cannot be processed.
        if(!stopped)setState('error');
        return;
      }
      const hand = hands[0];
      if (hands.length !== 1 || !hand || hand.length !== 21) {
        stableCount = 0; stableSince = 0;
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
        stableCount = 0; stableSince = 0;
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
        stableCount = 0; stableSince = 0;
        previous = hand;
        setState('open');
        return;
      }

      const motion = previous
        ? hand.reduce((sum, point, index) => sum + distance(point, previous![index]!), 0) /
          hand.length
        : Number.POSITIVE_INFINITY;
      previous = hand;
      const now = performance.now();
      if (stableCount > 0 && motion < STABLE_LANDMARK_DELTA && now - previousAt <= 500) { stableCount += 1; }
      else { stableCount = 1; stableSince = now; }
      previousAt = now;
      const ready = stableCount >= STABLE_LANDMARK_FRAMES && now - stableSince >= STABLE_DURATION_MS;
      if (ready && !readyMarked) { performance.mark('palm.stable'); readyMarked = true; }
      if (!ready) readyMarked = false;
      setState(ready ? 'ready' : 'moving');
    };

    void (async () => {
      try {
        landmarker=getPalmTracker();
        await landmarker.initialize();
        if (stopped) return;
        setState('place');
        timer = window.setInterval(()=>void sample(), LANDMARK_INTERVAL_MS);
      } catch {
        if (!stopped) setState('error');
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, [active, videoRef]);

  return { state, landmarks };
}
