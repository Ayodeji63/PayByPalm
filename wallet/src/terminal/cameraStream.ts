/** Short camera leases let amount entry hand a warm stream to capture.
 * The last lease closes tracks after the React screen transition. No frames persist. */
let opening: Promise<MediaStream> | null = null;
let stream: MediaStream | null = null;
let leases = 0;
let generation = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
export function leaseCamera(): { ready: Promise<MediaStream>; release: () => void } {
  leases += 1;
  clearTimeout(closeTimer);
  if (stream && stream.getVideoTracks().every(track => track.readyState === 'ended')) { stream = null; opening = null; }
  if (!opening) {
    const openedGeneration = ++generation;
    opening = navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false,
    }).then(value => {
      if (generation !== openedGeneration) { value.getTracks().forEach(track => track.stop()); throw new Error('Camera preparation was cancelled.'); }
      stream = value; if (!leases) scheduleClose(); return value;
    }).catch(error => { if (generation === openedGeneration) opening = null; throw error; });
  }
  let released = false;
  return { ready: opening, release() { if (released) return; released = true; leases -= 1; if (!leases) scheduleClose(); } };
}
function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { if (leases) return; generation += 1; stream?.getTracks().forEach(track => track.stop()); stream = null; opening = null; }, 250);
}
