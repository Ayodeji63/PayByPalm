/**
 * TopUp Route — Redirected to the unified /cards?action=add page.
 *
 * PayByPalm operates on tokenized Card-on-File infrastructure (Google Wallet model).
 * All card linking is maintained at /cards.
 */

import { Navigate } from 'react-router-dom';

export default function TopUp() {
  return <Navigate to="/cards?action=add" replace />;
}
