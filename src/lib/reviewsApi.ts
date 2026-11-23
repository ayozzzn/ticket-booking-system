import { apiRequest } from '@/lib/apiClient';
import type { EventReview, EventReviewsData, ReviewMood, ReviewReaction } from '@/types/ticketing';

export const MOODS: { emoji: ReviewMood; label: string }[] = [
  { emoji: '😍', label: 'Loved it' },
  { emoji: '🤩', label: 'Wow' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '😱', label: 'Scary' },
  { emoji: '😢', label: 'Touching' },
  { emoji: '😴', label: 'Boring' },
];
export const REACTIONS: { emoji: ReviewReaction; label: string }[] = [
  { emoji: '👍', label: 'Helpful' },
  { emoji: '❤️', label: 'Love it' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '🔥', label: 'Fire' },
];
export const RATING_WORDS = ['', 'Terrible', 'Not good', 'Okay', 'Good', 'Amazing!'];

/** Reviews of one event. Sends the login token when there is one, so "mine" and my reactions are known. */
export const fetchEventReviews = (eventId: string) =>
  apiRequest<EventReviewsData>(`/api/events/${encodeURIComponent(eventId)}/reviews`, {}, 'optional');

/** Creates the review, or updates it when this user already reviewed the event. */
export const saveEventReview = (eventId: string, input: { rating: number; mood: ReviewMood | null; comment: string }) =>
  apiRequest<EventReview>(`/api/events/${encodeURIComponent(eventId)}/reviews`, {
    method: 'PUT', body: JSON.stringify(input),
  }, true);

export const deleteEventReview = (reviewId: string) =>
  apiRequest<{ deleted: boolean }>(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }, true);

export const toggleReviewReaction = (reviewId: string, emoji: ReviewReaction) =>
  apiRequest<EventReview>(`/api/reviews/${encodeURIComponent(reviewId)}/reactions`, {
    method: 'POST', body: JSON.stringify({ emoji }),
  }, true);

/** "just now", "5 min ago", "3 days ago", or a date for older reviews. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86_400 * 7) return `${Math.floor(s / 86_400)} ${Math.floor(s / 86_400) === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' });
}
