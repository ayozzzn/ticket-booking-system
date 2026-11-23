import { AlertCircle, BadgeCheck, Loader2, MessageSquareHeart, Pencil, Send, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSession } from '@/hooks/useSession';
import {
  MOODS, RATING_WORDS, REACTIONS, deleteEventReview, fetchEventReviews, saveEventReview, timeAgo, toggleReviewReaction,
} from '@/lib/reviewsApi';
import type { EventReview, EventReviewsData, ReviewMood, ReviewReaction } from '@/types/ticketing';

type SortMode = 'newest' | 'top' | 'low' | 'liked';
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'top', label: 'Top rated' },
  { id: 'low', label: 'Lowest' },
  { id: 'liked', label: 'Most liked' },
];
const AVATAR_COLORS = ['bg-crimson', 'bg-amber-600', 'bg-teal-700', 'bg-violet-700', 'bg-rose-600', 'bg-sky-700'];
const avatarColor = (name: string) => AVATAR_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];
const reactionTotal = (r: EventReview) => Object.values(r.reactions).reduce((n, v) => n + (v ?? 0), 0);

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-wine-900/20'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

interface Props {
  eventId: string;
  eventTitle: string;
  /** Lets the page header update its ★ average right after someone posts. */
  onSummaryChange?: (average: number | null, count: number) => void;
}

/** Reviews of one event: summary, a form to rate with stars and a mood emoji, and reactions under each review. */
export default function EventReviews({ eventId, eventTitle, onSummaryChange }: Props) {
  const { session } = useSession();
  const [data, setData] = useState<EventReviewsData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');

  // form
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [mood, setMood] = useState<ReviewMood | null>(null);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [justPosted, setJustPosted] = useState(false);

  // list
  const [sort, setSort] = useState<SortMode>('newest');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [popping, setPopping] = useState<string>(''); // `${reviewId}:${emoji}` that just got pressed
  const [actionError, setActionError] = useState('');

  // Kept in a ref so a new callback from the parent does not trigger a reload.
  const summaryCallback = useRef(onSummaryChange);
  summaryCallback.current = onSummaryChange;

  const load = useCallback(async () => {
    try {
      const next = await fetchEventReviews(eventId);
      setData(next);
      setStatus('ready');
      summaryCallback.current?.(next.summary.average != null ? Number(next.summary.average) : null, next.summary.count);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load reviews.');
      setStatus('error');
    }
  }, [eventId]);

  // Reload when the event or the logged-in user changes ("mine" and my reactions depend on the user).
  useEffect(() => {
    setStatus('loading');
    void load();
  }, [load, session?.user.id]);

  const mine = data?.reviews.find((r) => r.mine) ?? null;
  const showForm = Boolean(session) && (!mine || editing);

  function startEdit() {
    if (!mine) return;
    setRating(mine.rating);
    setMood(mine.mood);
    setComment(mine.comment);
    setEditing(true);
    setFormError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rating === 0) return setFormError('Tap the stars to rate first.');
    setSaving(true);
    setFormError('');
    try {
      await saveEventReview(eventId, { rating, mood, comment: comment.trim() });
      setEditing(false);
      setRating(0);
      setMood(null);
      setComment('');
      setJustPosted(true);
      window.setTimeout(() => setJustPosted(false), 2600);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save your review.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(review: EventReview) {
    const question = review.mine ? 'Delete your review?' : `Delete the review by ${review.display_name}?`;
    if (!window.confirm(question)) return;
    try {
      await deleteEventReview(review.id);
      setEditing(false);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the review.');
    }
  }

  async function react(review: EventReview, emoji: ReviewReaction) {
    if (!session) return setActionError('Log in to react to reviews.');
    if (review.mine) return;
    setActionError('');
    setPopping(`${review.id}:${emoji}`);
    window.setTimeout(() => setPopping(''), 700);
    // Show the change at once; the server answer then sets the real numbers.
    const had = review.my_reactions.includes(emoji);
    const optimistic: EventReview = {
      ...review,
      my_reactions: had ? review.my_reactions.filter((x) => x !== emoji) : [...review.my_reactions, emoji],
      reactions: { ...review.reactions, [emoji]: Math.max(0, (review.reactions[emoji] ?? 0) + (had ? -1 : 1)) },
    };
    const put = (r: EventReview) => setData((d) => (d ? { ...d, reviews: d.reviews.map((x) => (x.id === r.id ? r : x)) } : d));
    put(optimistic);
    try {
      put(await toggleReviewReaction(review.id, emoji));
    } catch (err) {
      put(review);
      setActionError(err instanceof Error ? err.message : 'Could not save your reaction.');
    }
  }

  const list = useMemo(() => {
    const rows = (data?.reviews ?? []).filter((r) => !r.mine && (starFilter === null || r.rating === starFilter));
    const by: Record<SortMode, (a: EventReview, b: EventReview) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      top: (a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at),
      low: (a, b) => a.rating - b.rating || b.created_at.localeCompare(a.created_at),
      liked: (a, b) => reactionTotal(b) - reactionTotal(a) || b.created_at.localeCompare(a.created_at),
    };
    return rows.sort(by[sort]);
  }, [data, sort, starFilter]);

  const summary = data?.summary;
  const count = summary?.count ?? 0;
  const avg = summary?.average != null ? Number(summary.average) : null;
  const moodTotal = Object.values(summary?.moods ?? {}).reduce((n, v) => n + (v ?? 0), 0);
  const shownRating = hover || rating;

  return (
    <section id="reviews" className="mt-16 scroll-mt-24" aria-labelledby="reviews-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="font-display text-4xl font-bold text-gold">Reviews</h2>
          <p className="mt-2 text-cream-dim">What people think about {eventTitle}.</p>
        </div>
      </div>

      {status === 'loading' && (
        <p className="mt-8 flex items-center gap-3 text-cream-dim"><Loader2 className="h-5 w-5 animate-spin" /> Loading reviews…</p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-8 flex items-center gap-3 rounded-2xl bg-red-950/60 p-4 text-red-100">
          <AlertCircle className="h-5 w-5 shrink-0" /> {loadError}
        </p>
      )}

      {status === 'ready' && data && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* Summary */}
          <aside className="h-fit space-y-5 rounded-3xl bg-cream p-6 text-wine-900 shadow-xl shadow-black/40 lg:sticky lg:top-24">
            <div className="flex items-center gap-5">
              <p className="font-display text-6xl font-bold leading-none tabular-nums">{avg !== null ? avg.toFixed(1) : '—'}</p>
              <div>
                <Stars value={avg ?? 0} size="h-5 w-5" />
                <p className="mt-1 text-sm text-wine-900/65">{count === 0 ? 'No reviews yet' : `${count} ${count === 1 ? 'review' : 'reviews'}`}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const k = String(n) as '1' | '2' | '3' | '4' | '5';
                const value = summary?.distribution[k] ?? 0;
                const pct = count ? Math.round((value / count) * 100) : 0;
                const active = starFilter === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={value === 0}
                    aria-pressed={active}
                    onClick={() => setStarFilter(active ? null : n)}
                    className={`flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-sm transition disabled:cursor-default ${active ? 'bg-crimson/10' : 'hover:bg-wine-900/5'}`}
                  >
                    <span className="flex w-7 items-center gap-0.5 font-semibold">{n}<Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" /></span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-wine-900/10">
                      <span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-crimson transition-all duration-700" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-wine-900/60">{value}</span>
                  </button>
                );
              })}
            </div>

            {moodTotal > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-wine-900/55">Audience mood</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MOODS.filter((m) => summary?.moods[m.emoji]).sort((a, b) => (summary?.moods[b.emoji] ?? 0) - (summary?.moods[a.emoji] ?? 0)).map((m) => (
                    <span key={m.emoji} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-wine-900/10" title={m.label}>
                      <span className="text-lg leading-none">{m.emoji}</span>
                      <span className="font-semibold tabular-nums">{Math.round(((summary?.moods[m.emoji] ?? 0) / moodTotal) * 100)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-5">
            {/* Write / my review */}
            {!session ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-dashed border-gold/40 p-6">
                <div className="flex items-center gap-4">
                  <span className="text-4xl" aria-hidden="true">🍿</span>
                  <div>
                    <p className="font-display text-xl font-bold text-cream">Been there? Rate it!</p>
                    <p className="text-sm text-cream-dim">Log in to leave stars, a mood and a few words.</p>
                  </div>
                </div>
                <a href="#/login" className="rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-crimson-bright">Log in to review</a>
              </div>
            ) : showForm ? (
              <form onSubmit={submit} className="rounded-3xl bg-cream p-6 text-wine-900 shadow-xl shadow-black/40">
                <div className="flex items-center gap-2">
                  <MessageSquareHeart className="h-5 w-5 text-crimson" aria-hidden="true" />
                  <h3 className="font-display text-xl font-bold">{editing ? 'Edit your review' : 'Your review'}</h3>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <div className="flex gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} ${n === 1 ? 'star' : 'stars'}: ${RATING_WORDS[n]}`}
                        onMouseEnter={() => setHover(n)}
                        onClick={() => { setRating(n); setFormError(''); }}
                        className="rounded-lg p-0.5 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                      >
                        <Star
                          key={`${n}-${rating}`}
                          className={`h-9 w-9 transition ${n <= shownRating ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-wine-900/25'} ${n === rating ? 'animate-emoji-pop' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                  <span className={`min-w-[90px] font-display text-lg font-bold ${shownRating ? 'text-crimson' : 'text-wine-900/40'}`} aria-live="polite">
                    {shownRating ? RATING_WORDS[shownRating] : 'Tap to rate'}
                  </span>
                </div>

                <p className="mt-5 text-sm font-semibold">How did it make you feel? <span className="font-normal text-wine-900/55">(optional)</span></p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Mood">
                  {MOODS.map((m) => {
                    const on = mood === m.emoji;
                    return (
                      <button
                        key={m.emoji}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setMood(on ? null : m.emoji)}
                        className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold transition ${
                          on ? 'bg-crimson text-cream shadow-lg shadow-crimson/30' : 'bg-white ring-1 ring-wine-900/10 hover:-translate-y-0.5 hover:ring-crimson/40'
                        }`}
                      >
                        <span key={on ? 'on' : 'off'} className={`text-3xl leading-none ${on ? 'animate-emoji-pop' : ''}`}>{m.emoji}</span>
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <label htmlFor="review-text" className="mt-5 block text-sm font-semibold">
                  A few words <span className="font-normal text-wine-900/55">(optional)</span>
                </label>
                <textarea
                  id="review-text"
                  rows={3}
                  maxLength={1000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What was the best part? Would you recommend it?"
                  className="mt-2 w-full resize-y rounded-2xl border border-wine-900/15 bg-white p-3 text-sm outline-none transition focus:border-crimson focus:ring-2 focus:ring-crimson/20"
                />
                <div className="mt-1 flex justify-between text-xs text-wine-900/55">
                  <span>Your name is shown as first name and initial.</span>
                  <span className="tabular-nums">{comment.length}/1000</span>
                </div>

                {formError && <p role="alert" className="mt-3 animate-shake rounded-xl bg-red-50 p-3 text-sm text-red-800">{formError}</p>}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    disabled={saving}
                    className="flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-semibold text-cream shadow-lg shadow-crimson/30 transition hover:bg-crimson-bright disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {editing ? 'Save changes' : 'Post review'}
                  </button>
                  {editing && (
                    <button type="button" onClick={() => { setEditing(false); setRating(0); setMood(null); setComment(''); }} className="rounded-full px-5 py-3 text-sm font-semibold text-wine-900/70 hover:bg-wine-900/5">
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            ) : mine ? (
              <div className="relative">
                {justPosted && (
                  <div className="pointer-events-none absolute -top-3 right-6 z-10 flex animate-fade-up items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                    <span className="animate-emoji-pop text-lg">{mine.mood ?? '🎉'}</span> Thanks! Your review is live
                  </div>
                )}
                <ReviewCard review={mine} highlight onEdit={startEdit} onDelete={() => void remove(mine)} onReact={() => undefined} popping="" expanded expand={() => undefined} />
              </div>
            ) : null}

            {/* List */}
            {count > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-full bg-wine-950/60 p-1 ring-1 ring-gold/20" role="group" aria-label="Sort reviews">
                  {SORTS.map((s) => (
                    <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${sort === s.id ? 'bg-crimson text-cream' : 'text-cream-dim hover:text-cream'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
                {starFilter !== null && (
                  <button type="button" onClick={() => setStarFilter(null)} className="rounded-full bg-cream/10 px-4 py-2 text-sm font-semibold text-cream hover:bg-cream/20">
                    Only {starFilter}★ · show all ✕
                  </button>
                )}
              </div>
            )}

            {actionError && <p role="alert" className="rounded-xl bg-red-950/60 p-3 text-sm text-red-100">{actionError}</p>}

            {count === 0 ? (
              <div className="rounded-3xl border border-dashed border-gold/40 p-10 text-center">
                <p className="text-5xl" aria-hidden="true">✨</p>
                <p className="mt-3 font-display text-2xl font-bold text-cream">No reviews yet</p>
                <p className="mt-1 text-cream-dim">Be the first to tell others how it was.</p>
              </div>
            ) : list.length === 0 && !mine ? (
              <p className="text-cream-dim">No {starFilter}-star reviews.</p>
            ) : (
              <ul className="space-y-4">
                {list.map((r) => (
                  <li key={r.id}>
                    <ReviewCard
                      review={r}
                      canReact={Boolean(session)}
                      onReact={(emoji) => void react(r, emoji)}
                      onDelete={data.can_moderate ? () => void remove(r) : undefined}
                      popping={popping}
                      expanded={expanded.has(r.id)}
                      expand={() => setExpanded((s) => new Set(s).add(r.id))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface CardProps {
  review: EventReview;
  highlight?: boolean;
  canReact?: boolean;
  onReact: (emoji: ReviewReaction) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  popping: string;
  expanded: boolean;
  expand: () => void;
}

function ReviewCard({ review: r, highlight, canReact, onReact, onEdit, onDelete, popping, expanded, expand }: CardProps) {
  const long = r.comment.length > 280;
  const text = long && !expanded ? `${r.comment.slice(0, 260).trimEnd()}…` : r.comment;
  const mood = MOODS.find((m) => m.emoji === r.mood);
  return (
    <article className={`rounded-3xl bg-cream p-5 text-wine-900 shadow-xl shadow-black/40 sm:p-6 ${highlight ? 'ring-2 ring-gold' : ''}`}>
      <header className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-bold text-cream ${avatarColor(r.display_name)}`} aria-hidden="true">
          {r.display_name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            {highlight ? 'Your review' : r.display_name}
            {r.verified && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800" title="Bought a ticket on Kesh">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Ticket holder
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-wine-900/55">
            <Stars value={r.rating} />
            <span>{timeAgo(r.created_at)}{r.edited ? ' · edited' : ''}</span>
          </div>
        </div>
        {mood && (
          <span className="flex shrink-0 flex-col items-center rounded-2xl bg-white px-2.5 py-1.5 ring-1 ring-wine-900/10" title={mood.label}>
            <span className="text-2xl leading-none">{mood.emoji}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-wine-900/55">{mood.label}</span>
          </span>
        )}
      </header>

      {r.comment && (
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-wine-900/85">
          {text}
          {long && !expanded && (
            <button type="button" onClick={expand} className="ml-1 font-semibold text-crimson hover:underline">Read more</button>
          )}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {REACTIONS.map((x) => {
            const n = r.reactions[x.emoji] ?? 0;
            const on = r.my_reactions.includes(x.emoji);
            const pop = popping === `${r.id}:${x.emoji}`;
            if (r.mine && n === 0) return null;
            return (
              <button
                key={x.emoji}
                type="button"
                disabled={r.mine}
                aria-pressed={on}
                title={r.mine ? x.label : canReact ? x.label : 'Log in to react'}
                aria-label={`${x.label}: ${n}`}
                onClick={() => onReact(x.emoji)}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:cursor-default ${
                  on ? 'bg-crimson/10 font-semibold text-crimson ring-1 ring-crimson/40' : 'bg-white ring-1 ring-wine-900/10 hover:-translate-y-0.5 hover:ring-crimson/30'
                }`}
              >
                <span key={pop ? 'pop' : 'still'} className={`text-base leading-none ${pop ? 'animate-emoji-pop' : ''}`}>{x.emoji}</span>
                {n > 0 && <span className="tabular-nums">{n}</span>}
                {pop && on && <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 animate-float-up text-xs font-bold text-crimson">+1</span>}
              </button>
            );
          })}
        </div>
        {(onEdit || onDelete) && (
          <div className="flex gap-1.5">
            {onEdit && (
              <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-wine-900/70 hover:bg-wine-900/5">
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
