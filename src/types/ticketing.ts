export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price_cents: number;
  capacity: number;
  sold: number;
  /** 'reserved' = the customer picks seats on a seat map. Missing = 'general'. */
  seating?: 'general' | 'reserved';
  /** Movie session: set when this ticket type is one showing in a cinema. */
  cinema_id?: string | null;
  cinema?: Cinema | null;
  /** Session start (movies). Missing = the event's own date and time. */
  starts_at?: string | null;
  hall?: string | null;
  format?: string | null; // 2D, 3D, IMAX...
  language?: string | null; // RU, KZ, EN...
  /** Ticket types of a session with tenge prices (Adult, Student, Child). Empty = one price for everyone. */
  fares?: Fare[];
}

export interface Cinema {
  id: string;
  name: string;
  address: string;
  city: string;
  is_active?: boolean;
}

export interface Fare {
  id: string;
  name: string;
  price_kzt: number;
  note: string;
  sort_order: number;
}

/** One line of a booking with ticket types, e.g. 2 x Adult. */
export interface FareLine {
  fare_id: string;
  name: string;
  quantity: number;
  price_kzt: number;
}

export interface Seat {
  id: string;
  row: string; // "A", "B", ... "AA"
  row_no: number;
  seat: number; // 1, 2, 3 ... inside the row
  taken: boolean;
}

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  venue: string;
  city: string;
  starts_at: string;
  image_url: string | null;
  /** YouTube link of the trailer (movies). Missing or null = no trailer. */
  trailer_url?: string | null;
  /** Movies: age rating like "12+" and running time. */
  age_rating?: string | null;
  duration_minutes?: number | null;
  /** Average of the reviews (1-5) and how many there are. Kept up to date by the database. */
  rating_avg?: number | string | null;
  rating_count?: number;
  ticket_tiers: TicketTier[];
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';
export type PaymentMethod = 'card' | 'kaspi_qr' | 'halyk_qr';
export type PaymentStatus = 'awaiting' | 'requires_action' | 'paid' | 'failed' | 'cancelled' | 'expired';
export type RefundStatus = 'none' | 'pending' | 'refunded';

export interface PaymentInfo {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_kzt: number;
  card_brand: string | null;
  card_last4: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  refund_percent: number | null;
  refund_kzt: number;
  refund_status: RefundStatus;
  refunded_at: string | null;
}

export interface BookingReceipt {
  booking_code: string;
  customer_name: string;
  customer_email: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  created_at: string;
  event_title: string;
  event_venue: string;
  event_city: string;
  event_starts_at: string;
  tier_name: string;
  /** null = old booking from before statuses existed (treated as confirmed) */
  status: BookingStatus | null;
  cancelled_at: string | null;
  /** Price in tenge, fixed when the booking was created (null on very old bookings). */
  total_kzt?: number | null;
  /** While 'pending': the tickets are held until this moment. */
  hold_expires_at?: string | null;
  payment?: PaymentInfo | null;
  /** What a cancellation would refund right now (paid bookings only). */
  refund_quote?: { percent: number; kzt: number } | null;
  /** Seats of a reserved-seating booking, e.g. ["C7", "C8"]. Empty or missing for general admission. */
  seat_labels?: string[] | null;
  /** Movie sessions: chosen ticket types, hall and format. */
  fares?: FareLine[] | null;
  hall?: string | null;
  format?: string | null;
  cinema_address?: string | null;
  event_id?: string;
}
export type ReviewMood = '😍' | '🤩' | '😂' | '😱' | '😢' | '😴';
export type ReviewReaction = '👍' | '❤️' | '😂' | '🔥';

export interface EventReview {
  id: string;
  rating: number;
  mood: ReviewMood | null;
  comment: string;
  display_name: string;
  created_at: string;
  edited: boolean;
  mine: boolean;
  /** The author has a paid ticket for this event. */
  verified: boolean;
  reactions: Partial<Record<ReviewReaction, number>>;
  my_reactions: ReviewReaction[];
}

export interface EventReviewsData {
  summary: {
    count: number;
    average: number | null;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
    moods: Partial<Record<ReviewMood, number>>;
  };
  reviews: EventReview[];
  can_moderate: boolean;
}
