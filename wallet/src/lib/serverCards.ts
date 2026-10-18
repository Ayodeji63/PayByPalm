import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.js';
import { cacheServerCards, getCards, getCardOwner, subscribeCards, DEFAULT_CARD_THEME } from './cardStore.js';
export interface ServerCard {
 id:string;bank:string;brand:string;last4:string;exp_month:string;exp_year:string;
 is_default:boolean;is_paused:boolean;created_at:string;
}
export interface CardLinkAttempt { reference:string;status:string;refundStatus:string;cardId:string|null;createdAt:string; }
export interface CardsResponse { enabled:boolean;testMode:boolean;amountMinor:number;currency:string;cards:ServerCard[];attempts:CardLinkAttempt[]; }
let loadRevision=0;
export async function loadLinkedCards():Promise<CardsResponse> {
 const owner=getCardOwner();
 const revision=++loadRevision;
 const data=await api.get<CardsResponse>('/cards');
 if(owner && revision===loadRevision)cacheServerCards(owner,data.cards.map(c=>({id:c.id,name:`${c.bank} ${c.brand}`,bank:c.bank,
  cardType:c.brand.toLowerCase().includes('mastercard')?'mastercard':c.brand.toLowerCase().includes('visa')?'visa':'verve',
  cardNumber:`•••• •••• •••• ${c.last4}`,last4:c.last4,expMonth:c.exp_month,expYear:c.exp_year,
  isDefault:c.is_default,isPaused:c.is_paused,createdAt:c.created_at,theme:DEFAULT_CARD_THEME})));
 return data;
}
export async function editLinkedCard(id:string,action:'default'|'pause'|'resume'|'remove'):Promise<void> {
 await api.post('/cards/'+encodeURIComponent(id),{action});await loadLinkedCards();
}
export function useServerCards() {
 const {me}=useAuth();
 const cards=useSyncExternalStore(subscribeCards,getCards,getCards);
 useEffect(()=>{
  if(!me?.id)return;
  const load=()=>{void loadLinkedCards().catch(()=>{});};
  load();window.addEventListener('focus',load);return ()=>window.removeEventListener('focus',load);
 },[me?.id]);
 return cards;
}
