export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price_cents: number;
  capacity: number;
  sold: number;
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
  status: 'confirmed' | 'cancelled' | null;
  cancelled_at: string | null;
}
