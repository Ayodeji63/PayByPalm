/** Only fixed diagnostic labels may be logged; provider messages may contain PII. */
export function classifyAuthFailure(error: { name?: string; code?: string; status?: number; message?: string }):
  'email_delivery' | 'signup_database' | 'rate_limit' | 'network' | 'upstream_service' | 'unknown' {
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) return 'rate_limit';
  if (error.code === 'email_address_not_authorized') return 'email_delivery';
  const message = error.message ?? '';
  if (/error sending (?:confirmation|recovery|magic ?link|email)|smtp|email address not authorized/i.test(message)) return 'email_delivery';
  if (/database error (?:saving new user|querying schema)|error creating (?:new )?user/i.test(message)) return 'signup_database';
  if (error.name === 'AuthRetryableFetchError' && error.status === 0) return 'network';
  if ((error.status ?? 0) >= 500) return 'upstream_service';
  return 'unknown';
}
