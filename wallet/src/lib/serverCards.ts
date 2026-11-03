import { useEffect, useSyncExternalStore } from 'react';
import { api,ApiError } from './api.js';
import { useAuth } from './auth.js';
import { cacheServerCards, getCards, getCardOwner, subscribeCards, DEFAULT_CARD_THEME } from './cardStore.js';
export interface ServerCard {
 id:string;bank:string;brand:string;last4:string;exp_month:string;exp_year:string;
 is_default:boolean;is_paused:boolean;created_at:string;
}
export type PaymentProvider = 'paystack' | 'flutterwave';
export interface CardLinkAttempt { provider?:PaymentProvider;amountMinor?:number; reference:string;status:string;refundStatus:string;cardId:string|null;createdAt:string; }
export type PaymentMode = 'test' | 'live';
export interface CardsResponse { provider?:PaymentProvider;enabled:boolean;paymentMode:PaymentMode;testMode:boolean;amountMinor:number;currency:string;cards:ServerCard[];attempts:CardLinkAttempt[]; }
let loadRevision=0;
export async function loadLinkedCards():Promise<CardsResponse> {
 const owner=getCardOwner();
 const revision=++loadRevision;
 const data=await api.get<CardsResponse>('/cards');
 if(data&&!data.provider)data.provider='paystack';
 if(data&&!['paystack','flutterwave'].includes(data.provider!))throw new ApiError(503,'invalid_payment_provider','Payment provider could not be confirmed.');
 if(!data||!['test','live'].includes(data.paymentMode))throw new ApiError(503,'payment_settings_outdated','The payment service needs an update. Please contact support.');
 if(!Array.isArray(data.cards)||!Array.isArray(data.attempts))throw new ApiError(503,'invalid_card_response','Card details could not be loaded. Please try again.');
 if(owner && revision===loadRevision)cacheServerCards(owner,data.cards.map(c=>({id:c.id,paymentProvider:data.provider,paymentMode:data.paymentMode,name:`${c.bank} ${c.brand}`,bank:c.bank,
  cardType:c.brand.toLowerCase().includes('mastercard')?'mastercard':c.brand.toLowerCase().includes('visa')?'visa':'verve',
  cardNumber:`•••• •••• •••• ${c.last4}`,last4:c.last4,expMonth:c.exp_month,expYear:c.exp_year,
  isDefault:c.is_default,isPaused:c.is_paused,createdAt:c.created_at,theme:DEFAULT_CARD_THEME})));
 return data;
}
export async function editLinkedCard(id:string,action:'default'|'pause'|'resume'|'remove',paymentMode:PaymentMode,paymentProvider:PaymentProvider='paystack'):Promise<void> {
 await api.post('/cards/'+encodeURIComponent(id),{action,paymentMode,paymentProvider});await loadLinkedCards();
}
export function useServerCards() {
 const {me}=useAuth();
 const cards=useSyncExternalStore(subscribeCards,getCards,getCards);
 useEffect(()=>{
  if(!me?.id)return;
  const load=()=>{void loadLinkedCards().catch(()=>{});};
  const visible=()=>{if(document.visibilityState==='visible')load();};
  load();window.addEventListener('focus',load);document.addEventListener('visibilitychange',visible);
  const timer=window.setInterval(visible,30000);
  return ()=>{window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',visible);window.clearInterval(timer);};
 },[me?.id,me?.paymentMode,me?.paymentProvider]);
 return cards;
}
