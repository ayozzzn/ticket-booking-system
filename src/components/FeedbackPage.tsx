import { useEffect, useState } from 'react';
import { MessageSquare, Star, Send, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/apiClient';
import { useSession } from '@/hooks/useSession';

type Feedback = { id: string; rating: number; category: string; comment: string; display_name: string; created_at: string };
const categories = ['General experience', 'Booking process', 'Website usability', 'Suggestion'];
export default function FeedbackPage() {
  const { session } = useSession();
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState(categories[0]);
  const [comment, setComment] = useState('');
  const [reviews, setReviews] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function load() {
    setLoading(true);
    try { setReviews(await apiRequest<Feedback[]>('/api/feedback')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load feedback.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) { setError('Please log in to leave feedback.'); return; }
    setSending(true); setError(''); setSuccess('');
    try {
      await apiRequest('/api/feedback', { method: 'POST', body: JSON.stringify({ rating, category, comment: comment.trim() }) }, true);
      setSuccess('Thank you! Your feedback has been published.');
      setRating(0); setComment(''); setCategory(categories[0]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send feedback.'); }
    finally { setSending(false); }
  }
  const avg = reviews.length ? (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1) : '—';
  return <div className="min-h-[75vh] bg-[#f8efe8] py-12 text-stone-900">
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.24em] text-rose-800">Your voice matters</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Kesh Feedback</h1><p className="mt-3 text-stone-600">Share your experience and help us make Kesh better.</p></div>
        <div className="rounded-2xl border border-rose-100 bg-white px-6 py-4 text-center shadow-sm"><p className="text-3xl font-bold text-rose-900">{avg} <Star className="inline h-6 w-6 fill-amber-400 text-amber-400" /></p><p className="text-xs text-stone-500">{reviews.length} review{reviews.length === 1 ? '' : 's'}</p></div>
      </div>
      <div className="grid gap-7 lg:grid-cols-[1fr_1.1fr]">
        <form onSubmit={submit} className="h-fit rounded-3xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex items-center gap-2"><MessageSquare className="text-rose-800"/><h2 className="font-display text-2xl">Leave a review</h2></div>
          {!session && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Please <a className="font-bold underline" href="#/login">log in</a> to submit a review. You can still read reviews below.</p>}
          <label className="block text-sm font-semibold">Your rating</label>
          <div className="my-3 flex gap-2" role="group" aria-label="Choose rating">
            {[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} className="rounded-lg p-1 transition hover:scale-110"><Star size={31} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}/></button>)}
          </div>
          <label className="mt-5 block text-sm font-semibold" htmlFor="feedback-category">Category</label>
          <select id="feedback-category" value={category} onChange={e => setCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-200 bg-white p-3">{categories.map(c => <option key={c}>{c}</option>)}</select>
          <label className="mt-5 block text-sm font-semibold" htmlFor="feedback-comment">Your feedback</label>
          <textarea id="feedback-comment" required minLength={10} maxLength={1000} rows={5} value={comment} onChange={e => setComment(e.target.value)} placeholder="What did you like? What can we improve?" className="mt-2 w-full resize-y rounded-xl border border-stone-200 p-3 outline-none focus:border-rose-700"/>
          <p className="mt-1 text-right text-xs text-stone-500">{comment.length}/1000</p>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
          <button disabled={sending || !session || rating === 0 || comment.trim().length < 10} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#971b34] px-4 py-3 font-bold text-white transition hover:bg-[#7e152c] disabled:cursor-not-allowed disabled:opacity-50"><Send size={17}/>{sending ? 'Sending...' : 'Submit feedback'}</button>
        </form>
        <section className="space-y-4" aria-label="Community reviews">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Community reviews</h2><button type="button" onClick={() => void load()} className="flex items-center gap-1 text-sm font-semibold text-rose-800"><RefreshCw size={15}/>Refresh</button></div>
          {loading ? <p className="text-stone-600">Loading reviews...</p> : reviews.length === 0 ? <div className="rounded-2xl bg-white p-8 text-center text-stone-500">No reviews yet. Be the first to share your experience!</div> : reviews.map(r => <article key={r.id} className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{r.display_name}</p><time className="text-xs text-stone-500" dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString()}</time></div><div className="mt-2 flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>{[1,2,3,4,5].map(n => <Star key={n} size={17} className={n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}/>)}</div><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-800">{r.category}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{r.comment}</p></article>)}
        </section>
      </div>
    </div>
  </div>;
}
