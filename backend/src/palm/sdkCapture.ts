import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../errors.js';

// PalmX H5 v1.3 ImageData.payload. Keep the ciphertext opaque; do not decode,
// log, persist, crop or recompress it as the legacy JPEG path did.
const encryptedImage = z.object({
  Data: z.string().min(1).max(Math.ceil(config.MAX_IMAGE_BYTES / 3) * 4 + 4096),
  DataDigest: z.string().regex(/^[a-f0-9]{32}$/i),
  ImageType: z.literal('RGB'),
}).strict();

export const sdkCaptureSchema = z.object({
  RgbImage: encryptedImage,
  LivenessRgbImage: encryptedImage,
  UserToken: z.string().min(1).max(8192),
  SdkVersion: z.string().min(1).max(128),
  SdkTimestamps: z.string().max(16384),
  VideoPath: z.literal('NO_VIDEO_UPLOAD'),
}).strict();

export type SdkCapture = z.infer<typeof sdkCaptureSchema>;

export function parseSdkCapture(payload: string): SdkCapture {
  let decoded: unknown;
  try { decoded = JSON.parse(payload); } catch { /* fixed public error below */ }
  const result = sdkCaptureSchema.safeParse(decoded);
  if (!result.success) throw new AppError(400, 'invalid_sdk_capture', 'The palm reader did not return a complete encrypted capture. Please scan again.');
  return result.data;
}
