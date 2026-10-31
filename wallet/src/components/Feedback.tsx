import { useEffect,useRef,useState,type FormEvent } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { Button } from './ui.js';
interface Review {id:string;rating:number;comment:string;updated_at?:string;published_at:string|null}
function Star({filled}:{filled:boolean}){return <svg width="22" height="22" viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>;}
function Stars({rating}:{rating:number}){
 return <span className="flex gap-1 text-accent" aria-label={`${rating} out of 5 stars`}>{[1,2,3,4,5].map(value=><Star key={value} filled={value<=rating}/>)}</span>;
}
export function Feedback(){
 const {me}=useAuth();
 const [rating,setRating]=useState(0),[comment,setComment]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const generation=useRef(0),submitting=useRef(false);
 useEffect(()=>{
  const current=++generation.current;let stopped=false;
  setRating(0);setComment('');setNotice('');setError('');setLoading(true);
  void api.get<{feedback:Review|null}>('/feedback/mine').then(({feedback})=>{if(!stopped&&feedback){setRating(feedback.rating);setComment(feedback.comment);setNotice(feedback.published_at?'Your current review is published. Editing it sends it back for review.':'Your feedback is private and awaiting review.');}}).catch(()=>{if(!stopped)setError('Could not load your feedback. You can try saving it below.');}).finally(()=>{if(!stopped)setLoading(false);});
  return()=>{stopped=true;if(generation.current===current)generation.current++;};
 },[me?.id]);
 async function submit(event:FormEvent){
  event.preventDefault();if(submitting.current||loading||!rating||!comment.trim())return;
  submitting.current=true;setBusy(true);setError('');setNotice('');const current=generation.current;
  try{await api.post('/feedback',{rating,comment:comment.trim()});if(current===generation.current)setNotice('Thank you. Your feedback was saved privately for review.');}
  catch(failure){if(current===generation.current)setError(failure instanceof Error?failure.message:'Could not save your feedback. Please try again.');}
  finally{submitting.current=false;if(current===generation.current)setBusy(false);}
 }
 return <section className="rounded-3xl border border-hairline bg-surface p-5 select-text" aria-labelledby="feedback-title">
  <h2 id="feedback-title" className="text-base font-semibold">Rate your PayByPalm experience</h2>
  <p className="mt-2 text-sm text-ink-muted">Tell us what worked and what could be better. Feedback is private unless an admin publishes it. Account details are never shown publicly.</p>
  <form onSubmit={event=>void submit(event)} className="mt-5 space-y-4">
   <fieldset disabled={loading||busy}><legend className="text-sm font-medium">Your rating</legend><div className="mt-2 flex gap-1">{[1,2,3,4,5].map(value=><label key={value} className="relative grid h-12 min-w-0 flex-1 cursor-pointer place-items-center rounded-xl border border-hairline has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"><input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="radio" name="rating" value={value} checked={rating===value} onChange={()=>{setRating(value);setNotice('');}} aria-label={`${value} ${value===1?'star':'stars'}`} required/><span aria-hidden="true" className="pointer-events-none text-accent"><Star filled={value<=rating}/></span></label>)}</div></fieldset>
   <label className="block text-sm font-medium" htmlFor="feedback-comment">Your comment</label>
   <textarea id="feedback-comment" rows={4} maxLength={2000} required disabled={loading||busy} value={comment} onChange={event=>{setComment(event.target.value);setNotice('');}} className="w-full resize-y rounded-2xl border border-hairline bg-surface p-3 text-base text-ink" placeholder="Share your experience…" aria-describedby="feedback-count"/>
   <p id="feedback-count" className="text-sm text-ink-muted">{comment.length}/2000 characters. Please leave out card numbers, PINs and other private details.</p>
   {loading&&<p role="status" className="text-sm text-ink-muted">Loading your feedback…</p>}
   {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
   {notice&&<p role="status" className="text-sm text-accent-deep">{notice}</p>}
   <Button type="submit" full loading={busy} disabled={loading||!rating||!comment.trim()}>Save feedback</Button>
  </form>
 </section>;
}
export function PublishedFeedback(){
 const [reviews,setReviews]=useState<Review[]>([]);
 useEffect(()=>{let stopped=false;void api.get<{reviews:Review[]}>('/feedback/public').then(result=>{if(!stopped)setReviews(result.reviews);}).catch(()=>{});return()=>{stopped=true;};},[]);
 if(!reviews.length)return null;
 return <section className="welcome-width py-12" aria-labelledby="public-feedback-title"><h2 id="public-feedback-title" className="text-2xl font-semibold">Community feedback</h2><p className="mt-3 text-base text-ink-muted">Reviews selected for publication by the PayByPalm team.</p><ul className="mt-6 grid gap-6 md:grid-cols-2">{reviews.map(review=><li key={review.id} className="border-t border-hairline pt-5"><Stars rating={review.rating}/><p className="mt-3 whitespace-pre-wrap break-words text-base text-ink">{review.comment}</p></li>)}</ul></section>;
}
