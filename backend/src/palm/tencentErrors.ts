/**
 * Tencent publishes separate RGB and Open API error-code tables. Keep their
 * numeric identities intact; similarities between descriptions are not a
 * numeric conversion rule.
 * https://palm.tencent.com/docs/palm-api/错误码
 * https://palm.tencent.com/docs/kyc-api
 */
export interface TencentFailure {
  status: number;
  code: string;
  message: string;
  description: string;
}

type PublicFailure = Omit<TencentFailure, 'description'>;
const failure = (status: number, code: string, message: string): PublicFailure => ({status, code, message});
const kinds = {
  parameter: failure(502, 'palm_request_invalid', 'The palm provider rejected the request parameters. Contact the terminal administrator.'),
  internal: failure(502, 'palm_provider_internal_error', 'The palm provider could not complete the operation. Retry later; contact support if it continues.'),
  callback: failure(502, 'palm_callback_failed', 'The palm provider could not process the callback. Contact support.'),
  version: failure(503, 'palm_version_unavailable', 'No palm recognition version is available for this application. Contact the terminal administrator.'),
  imageType: failure(422, 'palm_image_type_invalid', 'The palm image format is unsupported. Capture a new image; contact support if it continues.'),
  digest: failure(422, 'palm_image_integrity_failed', 'The palm image integrity check failed. Capture a new image and retry.'),
  liveness: failure(422, 'palm_liveness_failed', 'Palm liveness verification failed. Present your real, open palm to the camera and try again.'),
  video: failure(422, 'palm_video_liveness_failed', 'Palm video liveness verification failed. Repeat the guided capture with your real palm.'),
  quality: failure(422, 'palm_image_quality_failed', 'Palm image quality is too low. Keep your whole open hand visible, hold still and use even lighting, then retry.'),
  missingPalm: failure(409, 'palm_registration_missing', 'The registered palm could not be found. Link your palm again from your wallet.'),
  bound: failure(409, 'palm_already_bound', 'This palm is already registered with the palm service. Use its linked account or contact support to reconcile the previous registration.'),
  ownership: failure(409, 'palm_binding_conflict', 'The palm provider reported a conflicting account binding. Contact support to verify ownership.'),
  credential: failure(503, 'palm_credential_unavailable', 'The palm provider rejected its credentials. Contact the terminal administrator.'),
  thirdParty: failure(503, 'palm_third_party_authentication_failed', 'The palm provider could not complete third-party authentication. Contact the terminal administrator.'),
  credentialConflict: failure(409, 'palm_credential_conflict', 'The palm provider reported an existing credential. Contact the terminal administrator.'),
  notFound: failure(409, 'palm_data_not_found', 'The palm provider could not find the required registration data. Check palm enrollment in your wallet.'),
  noMatch: failure(422, 'palm_no_match', 'No registered palm matched this scan. Reposition your hand and try again.'),
  auxiliaryMissing: failure(409, 'palm_auxiliary_image_missing', 'A required palm registration image is missing. Contact support before enrolling again.'),
  verificationType: failure(502, 'palm_verification_type_invalid', 'The palm provider rejected the verification type. Contact the terminal administrator.'),
  capacity: failure(503, 'palm_capacity_exceeded', 'The palm registration library is full. Contact the administrator to increase capacity.'),
  auxiliaryLimit: failure(409, 'palm_auxiliary_image_limit', 'The palm registration image limit has been reached for this account. Contact support.'),
  userMismatch: failure(422, 'palm_verification_user_mismatch', 'Palm verification did not match the expected account. Check your account and scan again.'),
  expired: failure(409, 'palm_verification_expired', 'Palm verification has expired or is no longer available. Start a new palm scan.'),
  exists: failure(409, 'palm_registration_exists', 'This palm registration already exists. Check its linked account before enrolling again.'),
  similarity: failure(409, 'palm_high_similarity', 'The palm provider found a registration with high similarity. Contact support to review the registration.'),
  database: failure(502, 'palm_provider_database_error', 'The palm provider could not complete its database operation. Retry later; contact support if it continues.'),
  userMissing: failure(409, 'palm_user_missing', 'The palm provider could not find the registered account. Check palm enrollment in your wallet.'),
  directionMissing: failure(409, 'palm_direction_missing', 'This hand is not registered for the account. Use the hand you enrolled or update palm enrollment.'),
  concurrent: failure(409, 'palm_operation_conflict', 'Another palm operation is in progress. Wait briefly, then retry.'),
  sync: failure(502, 'palm_sync_conflict', 'The palm provider reported a registration synchronization conflict. Contact support.'),
  quota: failure(503, 'palm_quota_exceeded', 'The palm provider registration quota has been reached. Contact the terminal administrator.'),
  license: failure(503, 'palm_license_unavailable', 'The palm provider has not enabled the required feature for this application. Contact the terminal administrator.'),
  quotaSetting: failure(502, 'palm_quota_invalid', 'The configured palm quota is below current usage. Contact the terminal administrator.'),
  application: failure(503, 'palm_application_unavailable', 'Palm payments are unavailable because the palm provider could not find the configured application. Contact the terminal administrator.'),
  applicationExists: failure(409, 'palm_application_exists', 'The palm provider application already exists. Contact the terminal administrator.'),
  forbidden: failure(503, 'palm_provider_forbidden', 'The palm provider has denied access to this application. Contact the terminal administrator.'),
  rate: failure(503, 'palm_provider_rate_limited', 'The palm provider is receiving too many requests. Wait briefly, then retry.'),
};

const describe = (kind: PublicFailure, description: string): TencentFailure => ({...kind, description});
export const TENCENT_ERROR_CODES: Readonly<Record<number, TencentFailure>> = Object.freeze({
  1000000: describe(kinds.parameter, 'Parameter error'),
  1000001: describe(kinds.internal, 'Internal system error'),
  1000002: describe(kinds.parameter, 'Missing required parameter'),
  1000003: describe(kinds.callback, 'Callback event processing failed'),
  1000004: describe(kinds.parameter, 'Filter count exceeds limit'),
  1000005: describe(kinds.parameter, 'Page exceeds limit'),
  1001001: describe(kinds.version, 'No available version'),
  1001002: describe(kinds.imageType, 'Unknown image type'),
  1001003: describe(kinds.digest, 'Image MD5 mismatch'),
  1001004: describe(kinds.liveness, 'Liveness detection failed'),
  1001005: describe(kinds.quality, 'Quality detection failed'),
  1001006: describe(kinds.video, 'Video liveness detection failed'),
  1001007: describe(kinds.missingPalm, 'PalmId does not exist'),
  1001008: describe(kinds.bound, 'Already bound'),
  1001009: describe(kinds.ownership, 'PalmId may be bound by another account'),
  1001011: describe(kinds.thirdParty, 'Third-party authentication failed'),
  1001012: describe(kinds.notFound, 'No data found in provider database'),
  1001013: describe(kinds.noMatch, 'No user matched in palmprint search library'),
  1001014: describe(kinds.auxiliaryMissing, 'Auxiliary image does not exist'),
  1001015: describe(kinds.verificationType, 'Unknown verification type'),
  1001016: describe(kinds.capacity, 'System table capacity full'),
  1001017: describe(kinds.auxiliaryLimit, 'User auxiliary image count exceeds limit'),
  1001018: describe(kinds.userMismatch, 'UserId for verification does not match'),
  1001019: describe(kinds.expired, 'Verification ID expired'),
  1001020: describe(kinds.exists, 'PalmId already exists'),
  1001021: describe(kinds.similarity, 'High similarity palm exists'),
  1001022: describe(kinds.capacity, 'Application search library capacity reached'),
  // This RGB code has two documented meanings. Do not infer deletion or
  // erase local bindings from this error alone.
  1001023: describe(kinds.database, 'Database operation failed or user deleted'),
  1001024: describe(kinds.userMissing, 'User does not exist in provider database'),
  1001025: describe(kinds.directionMissing, 'Palm for specified direction does not exist'),
  1001026: describe(kinds.concurrent, 'Database concurrent operation conflict'),
  1001027: describe(kinds.exists, 'Palmprint already exists'),
  1001028: describe(kinds.sync, 'Feature sync index already exists'),
  1001029: describe(kinds.quota, 'Platform palm library feature quota exceeded'),
  1001030: describe(kinds.license, 'Platform not authorized for mid-air palm function'),
  1001031: describe(kinds.quotaSetting, 'Palm quota below current usage'),
  1001032: describe(kinds.application, 'Application does not exist'),
  1001033: describe(kinds.applicationExists, 'Application already exists'),

  1000011: describe(kinds.database, 'Provider database operation failed'),
  1000013: describe(kinds.forbidden, 'Provider access forbidden'),
  2060000: describe(kinds.credential, 'Provider credential rejected'),
  2060002: describe(kinds.rate, 'Provider request limit reached'),
  2060200: describe(kinds.credential, 'Provider credential not found'),
  2060201: describe(kinds.credentialConflict, 'Provider credential already exists'),
  2080000: describe(kinds.version, 'Algorithm version unavailable'),
  2080001: describe(kinds.imageType, 'Image type unsupported'),
  2080002: describe(kinds.digest, 'Image checksum failed'),
  2080003: describe(kinds.liveness, 'Live palm check failed'),
  2080004: describe(kinds.quality, 'Image quality check failed'),
  2080005: describe(kinds.video, 'Video liveness check failed'),
  2080006: describe(kinds.missingPalm, 'Registered palm missing'),
  2080007: describe(kinds.bound, 'Palm direction already registered'),
  2080008: describe(kinds.ownership, 'Conflicting palm ownership'),
  2080009: describe(kinds.notFound, 'Registration data absent'),
  2080010: describe(kinds.noMatch, 'Search found no matching user'),
  2080011: describe(kinds.capacity, 'Library shard full'),
  2080012: describe(kinds.auxiliaryLimit, 'Auxiliary image limit reached'),
  2080013: describe(kinds.expired, 'Verification expired'),
  2080014: describe(kinds.capacity, 'Application palm capacity exhausted'),
  2080015: describe(kinds.userMissing, 'Provider user deleted'),
  2080016: describe(kinds.userMissing, 'Provider user missing'),
  2080017: describe(kinds.directionMissing, 'Requested hand not registered'),
  2080018: describe(kinds.concurrent, 'Concurrent provider database operation'),
  2080019: describe(kinds.sync, 'Feature synchronization conflict'),
  2080020: describe(kinds.quota, 'Platform feature allocation exhausted'),
  2080021: describe(kinds.license, 'Online registration feature not licensed'),
  2080022: describe(kinds.quotaSetting, 'Requested quota below usage'),
  2080023: describe(kinds.application, 'Provider application missing'),
  2080024: describe(kinds.expired, 'Comparison session unavailable or expired'),
});

export const isTencentSearchMiss = (code?: number): boolean => code === 1001013 || code === 2080010;
/** Only a 1:1 candidate exclusion: this account has no template for this hand.
 * Never interpret transport, auth, quality, or missing-user errors as a miss. */
export const isTencentCompareDirectionAbsent = (code?: number, httpStatus?: number): boolean =>
  (httpStatus === undefined || httpStatus === 200 || httpStatus === 400) && (code === 1001025 || code === 2080017);
/** Only valid for a GetPalm absence check, never for arbitrary operations. */
export const isTencentPalmAbsent = (code?: number, httpStatus?: number): boolean =>
  (httpStatus === undefined || httpStatus === 200) && (code === 1001012 || code === 2080009);

export function classifyTencentError(code?: number, diagnostic = '', httpStatus?: number): TencentFailure {
  if (code === 999 && diagnostic.includes('call palm alignment sdk err: call PalmAlignGap by rect fail, ret=-360')) {
    return describe(failure(422, 'palm_image_alignment_failed', 'Palm comparison could not align the image. Face your open palm toward the camera, keep your whole hand visible and hold still, then try again.'), 'Observed palm alignment failure');
  }
  if (code !== undefined && Object.hasOwn(TENCENT_ERROR_CODES, code)) return TENCENT_ERROR_CODES[code]!;
  // HTTP statuses are kept separate from Tencent business codes. Never relabel
  // an unknown business code merely because its HTTP response was 400/403.
  if (code === undefined) {
    if (httpStatus === 401) return describe(kinds.credential, 'Provider HTTP authentication failure');
    if (httpStatus === 403) return describe(kinds.forbidden, 'Provider HTTP permission failure');
    if (httpStatus === 429) return describe(kinds.rate, 'Provider HTTP request limit reached');
  }
  return describe(failure(502, 'palm_provider_error', 'Palm service is unavailable. Please try again.'), code === undefined ? 'Provider transport or response failure' : 'Unrecognized Tencent error');
}
