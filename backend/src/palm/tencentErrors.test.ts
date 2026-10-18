import {describe,expect,it} from 'vitest';
import {classifyTencentError,isTencentPalmAbsent,isTencentSearchMiss,TENCENT_ERROR_CODES} from './tencentErrors.js';

describe('published Tencent RGB error identities',()=>{
  it.each([
    [1000000,'palm_request_invalid'],[1000001,'palm_provider_internal_error'],
    [1000002,'palm_request_invalid'],[1000003,'palm_callback_failed'],
    [1000004,'palm_request_invalid'],[1000005,'palm_request_invalid'],
    [1001001,'palm_version_unavailable'],[1001002,'palm_image_type_invalid'],
    [1001003,'palm_image_integrity_failed'],[1001004,'palm_liveness_failed'],
    [1001005,'palm_image_quality_failed'],[1001006,'palm_video_liveness_failed'],
    [1001007,'palm_registration_missing'],[1001008,'palm_already_bound'],
    [1001009,'palm_binding_conflict'],[1001011,'palm_third_party_authentication_failed'],
    [1001012,'palm_data_not_found'],[1001013,'palm_no_match'],
    [1001014,'palm_auxiliary_image_missing'],[1001015,'palm_verification_type_invalid'],
    [1001016,'palm_capacity_exceeded'],[1001017,'palm_auxiliary_image_limit'],
    [1001018,'palm_verification_user_mismatch'],[1001019,'palm_verification_expired'],
    [1001020,'palm_registration_exists'],[1001021,'palm_high_similarity'],
    [1001022,'palm_capacity_exceeded'],[1001023,'palm_provider_database_error'],
    [1001024,'palm_user_missing'],[1001025,'palm_direction_missing'],
    [1001026,'palm_operation_conflict'],[1001027,'palm_registration_exists'],
    [1001028,'palm_sync_conflict'],[1001029,'palm_quota_exceeded'],
    [1001030,'palm_license_unavailable'],[1001031,'palm_quota_invalid'],
    [1001032,'palm_application_unavailable'],[1001033,'palm_application_exists'],
  ] as const)('classifies code %s without translating its numeric identity', (providerCode,code)=>{
    const result=classifyTencentError(providerCode);
    expect(result.code).toBe(code);expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.description).not.toBe('Unrecognized Tencent error');
  });
  it('retains independent Open API aliases and unknown diagnostics',()=>{
    expect(classifyTencentError(2080023).code).toBe('palm_application_unavailable');
    expect(classifyTencentError(2080007).code).toBe('palm_already_bound');
    expect(classifyTencentError(2080004).code).toBe('palm_image_quality_failed');
    expect(classifyTencentError(2080003).code).toBe('palm_liveness_failed');
    expect(classifyTencentError(999,'unknown diagnostic').code).toBe('palm_provider_error');
    expect(classifyTencentError(9999999,'unknown diagnostic',403).code).toBe('palm_provider_error');
  });
  it('keeps normal no-match and verified-absence codes disjoint, with ambiguous failures in neither',()=>{
    for(const code of Object.keys(TENCENT_ERROR_CODES).map(Number)){
      expect(isTencentSearchMiss(code)).toBe([1001013,2080010].includes(code));
      expect(isTencentPalmAbsent(code)).toBe([1001012,2080009].includes(code));
    }
  });
});
