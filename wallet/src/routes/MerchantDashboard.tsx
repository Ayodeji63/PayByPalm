import { Link } from 'react-router-dom';

export default function MerchantDashboard() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Merchant reporting unavailable</h1>
      <p className="mt-4">Verified merchant balances, sales reports, and payouts are not yet available. Use the configured terminal for linked-card payments.</p>
      <Link className="mt-6 inline-block underline" to="/terminal">Open terminal</Link>
    </main>
  );
}
