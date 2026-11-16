import { CheckCircle2, Clock, TimerOff, XCircle } from 'lucide-react';
import type { BookingReceipt } from '@/types/ticketing';

interface BookingStatusBadgeProps {
  status?: BookingReceipt['status'];
  className?: string;
}

const LOOK = {
  confirmed: { label: 'Confirmed', style: 'bg-emerald-100 text-emerald-800', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', style: 'bg-red-100 text-red-800', Icon: XCircle },
  pending: { label: 'Awaiting payment', style: 'bg-amber-100 text-amber-900', Icon: Clock },
  expired: { label: 'Expired', style: 'bg-stone-200 text-stone-700', Icon: TimerOff },
} as const;

export default function BookingStatusBadge({ status, className = '' }: BookingStatusBadgeProps) {
  const { label, style, Icon } = LOOK[status ?? 'confirmed'];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
