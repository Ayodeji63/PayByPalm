import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';
interface FeedbackRow{id:string;user_id:string;rating:number;comment:string;created_at:string;updated_at:string;published_at:string|null}
interface Page{feedback:FeedbackRow[];total:number;page:number;pageSize:number}
export function Feedback(){
 const [data,setData]=useState<Page|null>(null),[page,setPage]=useState(1),[status,setStatus]=useState('all'),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const sequence=useRef(0),writing=useRef(false);
 const load=useCallback(async()=>{
  const current=++sequence.current;setLoading(true);setError('');
  try{const next=await api<Page>(`/feedback?page=${page}&status=${status}`);if(current===sequence.current)setData(next);}
  catch(failure){if(current===sequence.current)setError(failure instanceof Error?failure.message:'Could not load feedback.');}
  finally{if(current===sequence.current)setLoading(false);}
 },[page,status]);
 useEffect(()=>{setData(null);void load();return()=>{sequence.current++;};},[load]);
 async function publish(row:FeedbackRow){
  if(writing.current)return;
  const publication=!row.published_at;
  if(publication&&!window.confirm('Publish this exact rating and comment on the public welcome page? Check that the comment contains no private details.'))return;
  writing.current=true;setBusy(row.id);setError('');
  try{await api(`/feedback/${row.id}`,{publish:publication,expected:row.updated_at});await load();}
  catch(failure){setError(failure instanceof Error?failure.message:'Could not update publication.');}
  finally{writing.current=false;setBusy(null);}
 }
 const pages=Math.max(1,Math.ceil((data?.total??0)/10));
 return <section className="feedback-review" aria-label="Customer feedback">
  <div className="panel feedback-controls"><label className="field">Status<select aria-label="Feedback status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="all">All feedback</option><option value="private">Private</option><option value="published">Published</option></select></label><button className="button secondary" disabled={loading||!!busy} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh'}</button></div>
  {error&&<p role="alert" className="notice danger">{error}</p>}
  <p className="muted">Feedback is private by default. Published comments and ratings appear publicly without account details. Customer edits automatically remove publication.</p>
  {loading&&!data?<p role="status">Loading feedback…</p>:!data?.feedback.length?<div className="panel empty"><h2>No feedback in this view</h2><p>Customer ratings and comments will appear here after submission.</p></div>:<ul className="feedback-list">{data.feedback.map(row=><li key={row.id} className="panel feedback-entry"><div className="feedback-entry-heading"><h2>{row.rating}/5 rating</h2><span className="badge">{row.published_at?'Published':'Private'}</span></div><p className="feedback-comment">{row.comment}</p><p className="muted">Account {row.user_id.slice(0,8)} · Updated {new Date(row.updated_at).toLocaleString('en-GB',{timeZone:'Africa/Lagos'})} WAT</p><button className={`button ${row.published_at?'secondary':''}`} disabled={!!busy||loading} onClick={()=>void publish(row)}>{busy===row.id?'Saving…':row.published_at?'Unpublish':'Publish review'}</button></li>)}</ul>}
  <nav className="ops-pagination" aria-label="Feedback pagination"><span>{data?.total??0} {data?.total===1?'review':'reviews'} · Page {page} of {pages}</span><div><button className="button secondary" disabled={page<=1||loading||!!busy} onClick={()=>setPage(n=>n-1)}>Previous</button><button className="button secondary" disabled={page>=pages||loading||!!busy} onClick={()=>setPage(n=>n+1)}>Next</button></div></nav>
 </section>;
}
