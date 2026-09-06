/**
 * LinkCard Route — Aliased into the unified /cards?action=add page.
 *
 * All card linking and card management is now consolidated in one place (/cards).
 */

import { Navigate } from 'react-router-dom';

export default function LinkCard() {
  return <Navigate to="/cards?action=add" replace />;
}
