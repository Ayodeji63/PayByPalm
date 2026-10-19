/** Tencent owns the isolated capture iframe. Only short-lived user tokens enter it. */
export const PALM_SDK_LOADER = 'https://open.palmoa.youtu.qq.com/palm/x/jssdk/loader/palm-mobile-manager.js';

export interface PalmCaptureGrant {
  captureMode: 'h5';
  captureId: string;
  userId: string;
  token: string;
  expiresAt: string;
  loaderUrl: string;
  candidateCount?: number;
}

interface SdkResult { code: number; message?: string; data?: { payload?: string }; traceId?: string }
interface SdkManager {
  start: (params: {token: string; userId: string; mode: 'registration' | 'verification'; enableManager: false; enableImageOnly: true; enableLogReport: false}) => Promise<SdkResult>;
  back: () => void;
}
type SdkWindow = Window & {PalmMobileManager?: {PalmMobileManager: SdkManager}};
let loading: Promise<SdkManager> | undefined;
let active = false;

const messages: Record<number, string> = {
  10001: 'The palm reader configuration is invalid. Contact the administrator.',
  10002: 'Palm capture cancelled. Start again when you are ready. On a touchscreen, try portrait orientation.',
  10003: 'Camera access was denied. Allow camera access and try again.',
  10004: 'The camera could not start. Check its connection and try again.',
  10005: 'This browser cannot display the palm camera. Update Chromium and try again.',
  10006: 'The palm reader could not load. Check the connection and retry.',
  10007: 'Another palm capture is still open. Close it before trying again.',
  10008: 'Palm capture timed out. Reposition your hand and try again.',
  10012: 'The palm reader session expired. Start a new scan.',
  10016: 'Tencent could not validate this reader’s licence. Contact the administrator.',
  10018: 'Tencent rejected the user identifier. Contact the administrator.',
  10020: 'The Tencent application is disabled. Contact the administrator.',
  10021: 'Tencent could not find this user. Contact the administrator.',
  10100: 'Liveness checks failed. Follow the hand movement prompts and try again.',
  10101: 'Palm image quality was too low. Improve the lighting and try again.',
  10102: 'Tencent could not verify the liveness video. Please scan again.',
  10103: 'This palm is already registered. Unlink it before enrolling again.',
  10104: 'A similar palm is already registered. Contact support before continuing.',
  10105: 'The browser could not record the liveness capture. Check camera permissions.',
  10300: 'Tencent could not find the comparison user. Contact the administrator.',
  10301: 'This user has no registered palm in Tencent. Enrol the palm again.',
  10302: 'That hand is not registered. Use your enrolled hand.',
  10401: 'Tencent rejected the reader credential. Contact the administrator.',
  10500: 'The palm reader could not reach Tencent. Check the connection and retry.',
};

export function palmSdkError(code: number, traceId?: string): Error {
  const reference = traceId && /^[A-Za-z0-9_-]{1,128}$/.test(traceId) ? ` Reference: ${traceId}.` : '';
  return new Error(`${messages[code] ?? 'The palm reader could not complete capture. Please try again.'} (Tencent SDK ${code})${reference}`);
}

export function loadPalmSdk(url: string): Promise<SdkManager> {
  if (url !== PALM_SDK_LOADER) return Promise.reject(new Error('The palm reader host is not approved.'));
  const manager = (window as SdkWindow).PalmMobileManager?.PalmMobileManager;
  if (manager) return Promise.resolve(manager);
  if (loading) return loading;
  loading = new Promise<SdkManager>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PALM_SDK_LOADER;
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      const sdk = (window as SdkWindow).PalmMobileManager?.PalmMobileManager;
      if (error || !sdk) { script.remove(); loading = undefined; reject(error ?? new Error('The palm reader did not initialize. Please retry.')); }
      else resolve(sdk);
    };
    const timer = window.setTimeout(() => finish(new Error('The palm reader download timed out. Check the connection and retry.')), 20_000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('The palm reader could not load. Check the connection and retry.'));
    document.head.appendChild(script);
  });
  return loading;
}

export async function capturePalmSdk(grant: PalmCaptureGrant, signal: AbortSignal): Promise<string> {
  const sdk = await loadPalmSdk(grant.loaderUrl);
  if (signal.aborted) throw new Error('Palm capture cancelled.');
  if (active) throw palmSdkError(10007);
  if (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now()) throw palmSdkError(10012);
  active = true;
  let timer: number | undefined;
  let cancel: () => void = () => {};
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      cancel = () => { sdk.back(); reject(new Error('Palm capture cancelled.')); };
      signal.addEventListener('abort', cancel, {once: true});
      timer = window.setTimeout(() => { sdk.back(); reject(palmSdkError(10008)); }, Math.min(60_000, Date.parse(grant.expiresAt) - Date.now()));
    });
    const result = await Promise.race([sdk.start({
      // Neutral acquisition: no registered target/hand is selected in the SDK.
      // Image-only mode does not register this temporary capture identity.
      token: grant.token, userId: grant.userId, mode: 'registration',
      enableManager: false, enableImageOnly: true, enableLogReport: false,
    }), interrupted]);
    if (result.code !== 0) throw palmSdkError(result.code, result.traceId);
    // A browser match boolean is never submitted as payment authorization.
    if (typeof result.data?.payload !== 'string' || !result.data.payload.length || result.data.payload.length > 6_000_000) {
      throw new Error('The palm reader returned an incomplete capture. Please scan again.');
    }
    return result.data.payload;
  } finally {
    active = false;
    if (timer !== undefined) window.clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
