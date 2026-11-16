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
/** null = old booking from before statuses existed (treated as confirmed) */
  status: BookingStatus | null;
  cancelled_at: string | null;
  /** Seats of a reserved-seating booking, e.g. ["C7", "C8"]. Empty/missing for general admission. */
  seat_labels?: string[] | null;
  /** Price in tenge, fixed when the booking was created (null on very old bookings). */
  total_kzt?: number | null;
  /** While 'pending': the tickets are held until this moment. */
  hold_expires_at?: string | null;
  payment?: PaymentInfo | null;
  /** What a cancellation would refund right now (paid bookings only). */
  refund_quote?: { percent: number; kzt: number } | null;
}
}
