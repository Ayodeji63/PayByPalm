/** Run from a scheduler when the API is not continuously running. No charges are initiated. */
import { reconcileCardLinks } from '../src/services/cardLinkService.js';
import { reconcileCardPayments } from '../src/services/cardPaymentService.js';
await reconcileCardLinks();
await reconcileCardPayments();
