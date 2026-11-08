import { CheckCircle2, XCircle } from 'lucide-react';
import type { BookingReceipt } from '@/types/ticketing';

interface BookingStatusBadgeProps {
  status?: BookingReceipt['status'];
  className?: string;
}

export default function BookingStatusBadge({ status, className = '' }: BookingStatusBadgeProps) {
  const cancelled = status === 'cancelled';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        cancelled ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
      } ${className}`}
    >
      {cancelled ? (
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {cancelled ? 'Cancelled' : 'Confirmed'}
    </span>
  );
}
