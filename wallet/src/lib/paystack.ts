/** Card charging remains disabled until server verification and refunds exist. */
export function openPaystackPopup(): never {
  throw new Error('Card linking is currently unavailable.');
}
