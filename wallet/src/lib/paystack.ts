/**
 * Paystack inline popup helper.
 *
 * Wraps the Paystack inline.js that is loaded via index.html <script> tag.
 * Uses the pk_test_ public key from VITE env — safe for client-side.
 */

declare global {
  interface Window {
    PaystackPop: {
      setup(config: PaystackConfig): { openIframe(): void };
    };
  }
}

interface PaystackConfig {
  key: string;
  email: string;
  amount: number; // in kobo
  currency?: string;
  ref?: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
  onSuccess: (response: PaystackResponse) => void;
  onClose: () => void;
}

export interface PaystackResponse {
  reference: string;
  trans: string;
  status: string;
  message: string;
  transaction: string;
  trxref: string;
}

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;

/**
 * Opens the Paystack Popup for payment.
 *
 * The popup is Paystack's PCI-DSS compliant hosted form — card details never
 * touch our server. After a successful payment, the `onSuccess` callback fires
 * with the transaction reference.
 */
export function openPaystackPopup({
  email,
  amountKobo,
  onSuccess,
  onClose,
  metadata,
}: {
  email: string;
  amountKobo: number;
  onSuccess: (response: PaystackResponse) => void;
  onClose: () => void;
  metadata?: Record<string, unknown>;
}): void {
  const key = PAYSTACK_KEY ?? (import.meta.env as Record<string, string>).paystack_test_public_key;

  if (!key) {
    console.error('VITE_PAYSTACK_PUBLIC_KEY is not set');
    onClose();
    return;
  }

  if (!window.PaystackPop) {
    console.error('Paystack inline.js not loaded');
    onClose();
    return;
  }

  const ref = `pbp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const handler = window.PaystackPop.setup({
    key,
    email,
    amount: amountKobo,
    currency: 'NGN',
    ref,
    channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    metadata: {
      ...metadata,
      custom_fields: [
        { display_name: 'App', variable_name: 'app', value: 'PayByPalm' },
      ],
    },
    onSuccess,
    onClose,
  });

  handler.openIframe();
}
