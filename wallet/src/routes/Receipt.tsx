/**
 * Payment Receipt — success confirmation screen.
 *
 * Matches the design: animated green check, large amount, transaction details
 * card, biometric verification seal, and action buttons.
 *
 * Receives transaction data via route state from the transaction sheet or
 * after a payment flow.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { formatNaira } from '../lib/money.js';
import { Button } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';

interface ReceiptData {
  amount: number;
  merchantName: string;
  date: string;
  paymentMethod: string;
  terminal: string;
  status: string;
  palmVerified: boolean;
}

export default function Receipt() {
  const navigate = useNavigate();
  const location = useLocation();

  const data = (location.state as ReceiptData | null) ?? {
    amount: 2500_00,
    merchantName: 'Campus Mart #01',
    date: new Date().toLocaleString('en-NG', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }),
    paymentMethod: 'Palm Authorization',
    terminal: 'YabaTech Kiosk #1',
    status: 'Settled (T+1)',
    palmVerified: true,
  };

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center bg-canvas px-5 py-10">
        {/* Animated success check */}
        <div className="success-pulse flex h-24 w-24 items-center justify-center rounded-full bg-success">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-white">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="check-animate"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Payment Successful!</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Authorized instantly via palm biometric scan
        </p>

        {/* Amount */}
        <p className="numeric mt-6 text-4xl font-extrabold tracking-tight">
          {formatNaira(data.amount)}
        </p>

        {/* Details card */}
        <div className="mt-8 w-full rounded-3xl border border-hairline bg-surface p-5">
          <div className="divide-y divide-hairline">
            <DetailRow label="Merchant" value={data.merchantName} />
            <DetailRow label="Date & Time" value={data.date} />
            <DetailRow label="Payment Method" value={data.paymentMethod} />
            <DetailRow label="Terminal" value={data.terminal} />
            <DetailRow label="Status" value={data.status} />
          </div>

          {/* Biometric seal */}
          {data.palmVerified && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-success/20 bg-success-tint px-4 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-semibold text-success">
                Biometrically Verified & Signed
              </span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-8 flex w-full gap-3">
          <Button
            variant="secondary"
            full
            onClick={() => {
              // Placeholder for PDF generation
              const toast = document.createElement('div');
              toast.textContent = 'PDF download coming soon';
              toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-ink text-white px-4 py-2 rounded-full text-sm z-50';
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 2000);
            }}
          >
            Download PDF Receipt
          </Button>
          <Button
            variant="primary"
            full
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-semibold text-right">{value}</span>
    </div>
  );
}
