import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTierSeats } from '@/lib/bookingApi';
import type { Seat, TicketTier } from '@/types/ticketing';

interface SeatPickerProps {
  tier: TicketTier;
  /** How many seats the customer may pick in total. */
  maxSeats: number;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Change this number to force a fresh load of the seat map (e.g. after a "seats taken" error). */
  reloadKey?: number;
}

const seatLabel = (seat: Seat) => `${seat.row}${seat.seat}`;

export default function SeatPicker({ tier, maxSeats, selectedIds, onChange, reloadKey = 0 }: SeatPickerProps) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualReload, setManualReload] = useState(0);

  // Latest selection/callback for the loader, without re-running it on every click.
  const selectedRef = useRef(selectedIds);
  const onChangeRef = useRef(onChange);
  selectedRef.current = selectedIds;
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchTierSeats(tier.id)
      .then((list) => {
        if (cancelled) return;
        setSeats(list);
        setStatus('ready');
        // Drop chosen seats that somebody else has taken in the meantime.
        const free = new Set(list.filter((s) => !s.taken).map((s) => s.id));
        const stillFree = selectedRef.current.filter((id) => free.has(id));
        if (stillFree.length !== selectedRef.current.length) onChangeRef.current(stillFree);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'We could not load the seat map.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [tier.id, reloadKey, manualReload]);

  const rows = useMemo(() => {
    const byRow = new Map<number, { label: string; seats: Seat[] }>();
    for (const seat of seats) {
      let row = byRow.get(seat.row_no);
      if (!row) {
        row = { label: seat.row, seats: [] };
        byRow.set(seat.row_no, row);
      }
      row.seats.push(seat);
    }
    return [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  }, [seats]);

  const seatsPerRow = useMemo(() => seats.reduce((max, s) => Math.max(max, s.seat), 0), [seats]);
  const aisleAfter = Math.ceil(seatsPerRow / 2);
  const freeCount = useMemo(() => seats.filter((s) => !s.taken).length, [seats]);
  const byId = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);

  function toggle(seat: Seat) {
    if (seat.taken) return;
    if (selectedIds.includes(seat.id)) {
      onChange(selectedIds.filter((id) => id !== seat.id));
    } else if (selectedIds.length < maxSeats) {
      onChange([...selectedIds, seat.id]);
    }
  }

  if (status === 'loading') {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-3 rounded-2xl bg-white/60 py-16 text-wine-900/70 ring-1 ring-wine-900/15"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading seat map...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl bg-red-50 p-6 text-center text-sm text-red-800 ring-1 ring-red-200"
      >
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
        <p>{errorMessage}</p>
        <button
          type="button"
          onClick={() => setManualReload((n) => n + 1)}
          className="rounded-full bg-crimson px-4 py-2 font-medium text-cream transition hover:bg-crimson-bright"
        >
          Try again
        </button>
      </div>
    );
  }

  const selectedSeats = selectedIds
    .map((id) => byId.get(id))
    .filter((s): s is Seat => Boolean(s))
    .sort((a, b) => a.row_no - b.row_no || a.seat - b.seat);
  const atLimit = selectedIds.length >= maxSeats;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-wine-900">Choose your seats</p>
          <p className="text-sm text-wine-900/70">
            Up to {maxSeats} {maxSeats === 1 ? 'seat' : 'seats'} · {freeCount} free
          </p>
        </div>
        <button
          type="button"
          onClick={() => setManualReload((n) => n + 1)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-wine-900/75 ring-1 ring-wine-900/25 transition hover:bg-wine-900/10 hover:text-wine-900"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-wine-900/15">
        <div className="mx-auto mb-4 max-w-xs rounded-b-2xl bg-wine-900 py-1.5 text-center text-xs font-medium tracking-wide text-cream">
          Stage
        </div>

        <div className="max-h-72 overflow-auto" role="group" aria-label={`${tier.name} seat map`}>
          <div className="mx-auto w-fit space-y-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center gap-1.5">
                <span className="w-7 shrink-0 text-right text-xs font-medium text-wine-900/55" aria-hidden="true">
                  {row.label}
                </span>
                {row.seats.map((seat) => {
                  const selected = selectedIds.includes(seat.id);
                  const blockedByLimit = !selected && atLimit;
                  const stateClass = seat.taken
                    ? 'cursor-not-allowed bg-wine-900/15 text-wine-900/30'
                    : selected
                      ? 'bg-crimson text-cream shadow-sm'
                      : blockedByLimit
                        ? 'cursor-not-allowed bg-white text-wine-900/30 ring-1 ring-wine-900/15'
                        : 'bg-white text-wine-900 ring-1 ring-wine-900/25 hover:bg-crimson/10 hover:ring-crimson';
                  return (
                    <span key={seat.id} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={seat.taken || blockedByLimit}
                        aria-pressed={selected}
                        aria-label={`Row ${seat.row}, seat ${seat.seat}${seat.taken ? ', taken' : ''}`}
                        onClick={() => toggle(seat)}
                        className={`h-7 w-7 rounded-md text-[11px] font-medium tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${stateClass}`}
                      >
                        {seat.seat}
                      </button>
                      {seat.seat === aisleAfter && seat.seat < seatsPerRow && <span className="w-4" aria-hidden="true" />}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-wine-900/70">
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 rounded bg-white ring-1 ring-wine-900/25" aria-hidden="true" />
            Free
          </li>
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 rounded bg-crimson" aria-hidden="true" />
            Your choice
          </li>
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 rounded bg-wine-900/15" aria-hidden="true" />
            Taken
          </li>
        </ul>
      </div>

      <div
        className="flex items-start justify-between gap-4 rounded-2xl bg-white/60 p-4 ring-1 ring-wine-900/15"
        aria-live="polite"
      >
        <div className="min-w-0">
          <p className="text-sm text-wine-900/65">Your seats</p>
          <p className="mt-0.5 break-words font-medium text-wine-900">
            {selectedSeats.length > 0 ? selectedSeats.map(seatLabel).join(', ') : 'None selected yet'}
          </p>
          {atLimit && (
            <p className="mt-1 text-xs text-amber-800">
              You have reached the limit of {maxSeats}. Click a chosen seat to free it.
            </p>
          )}
        </div>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="shrink-0 text-sm font-medium text-crimson underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
