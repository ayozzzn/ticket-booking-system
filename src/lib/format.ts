const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatPrice(cents: number): string {
  return priceFormatter.format(cents / 100);
}

const kztFormatter = new Intl.NumberFormat('ru-KZ', {
  style: 'currency',
  currency: 'KZT',
  maximumFractionDigits: 0,
});

/** Tenge, e.g. "22 500 ₸". */
export function formatKzt(amount: number): string {
  return kztFormatter.format(amount).replace(/\u00a0/g, '\u202f');
}

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ticketsRemaining(tier: { capacity: number; sold: number }): number {
  return Math.max(tier.capacity - tier.sold, 0);
}
