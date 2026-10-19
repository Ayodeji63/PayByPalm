import {describe, expect, it} from 'vitest';
import {parseSdkCapture} from './sdkCapture.js';

const image = {Data: 'opaque-encrypted-image', DataDigest: 'a'.repeat(32), ImageType: 'RGB'};
const valid = {RgbImage: image, LivenessRgbImage: image, UserToken: 'sut_test-only', SdkVersion: '1.3.0', SdkTimestamps: '{}', VideoPath: 'NO_VIDEO_UPLOAD'};
describe('H5 acquisition boundary', () => {
  it('keeps encrypted images opaque', () => {
    expect(parseSdkCapture(JSON.stringify(valid))).toEqual(valid);
  });
  it.each([
    '{bad', JSON.stringify({...valid, LivenessRgbImage: undefined}),
    JSON.stringify({...valid, RgbImage: {...image, ImageType: 1}}),
    JSON.stringify({...valid, RgbImage: {...image, DataDigest: 'not-a-digest'}}),
    JSON.stringify({...valid, CompareUserId: 'attacker-chosen-user'}),
    JSON.stringify({...valid, IsMatch: true}),
    JSON.stringify({...valid, ActionLiveness: {VideoFileId: 'fabricated'}}),
  ])('rejects incomplete or caller-controlled provider fields', payload => {
    expect(() => parseSdkCapture(payload)).toThrow('complete encrypted capture');
  });
});
