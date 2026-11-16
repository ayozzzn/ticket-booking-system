import { Wifi } from 'lucide-react';
import { cardBrand, onlyDigits } from '@/lib/cardUtils';

interface CardPreviewProps {
  number: string;
  holder: string;
  expiry: string;
  cvc: string;
  /** Turns the card around to show the CVC side */
  flipped: boolean;
  /** Small red pulse when the bank said no */
  shake?: boolean;
}

function BrandMark({ brand }: { brand: ReturnType<typeof cardBrand> }) {
  if (brand === 'visa') return <span className="font-display text-3xl font-bold italic tracking-wide text-cream">VISA</span>;
  if (brand === 'mastercard')
    return <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cream">Mastercard</span>;
  return <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cream/60">Bank card</span>;
}

/** The card that follows what the customer types. Flips over while typing the CVC. */
export default function CardPreview({ number, holder, expiry, cvc, flipped, shake }: CardPreviewProps) {
  const digits = onlyDigits(number);
  const brand = cardBrand(digits);
  const shown = digits.padEnd(16, '•').slice(0, Math.max(16, digits.length));
  const groups = shown.match(/.{1,4}/g) ?? [];

  const face =
    'absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br from-crimson-bright via-crimson to-wine-900 p-5 text-cream shadow-2xl shadow-black/50 ring-1 ring-cream/20 [backface-visibility:hidden]';

  return (
    <div className={`mx-auto h-[200px] w-full max-w-[330px] [perspective:1100px] ${shake ? 'animate-shake' : ''}`} aria-hidden="true">
      <div
        className="relative h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* front */}
        <div className={face}>
          <span className="pointer-events-none absolute -inset-y-4 left-0 w-1/4 animate-sheen bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <span className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-gold/15" />
          <span className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-wine-950/30" />

          <div className="relative flex items-start justify-between">
            <span className="flex h-9 w-12 items-center justify-center rounded-md bg-gradient-to-br from-gold to-[#b98270] ring-1 ring-black/10">
              <span className="h-5 w-8 rounded-sm border border-wine-900/25" />
            </span>
            <span className="flex items-center gap-3">
              <Wifi className="h-5 w-5 rotate-90 text-cream/70" />
              <BrandMark brand={brand} />
            </span>
          </div>

          <p className="relative mt-7 flex gap-3 font-mono text-[19px] tracking-widest sm:text-xl">
            {groups.map((g, i) => (
              <span key={i} className={g.includes('•') && !/\d/.test(g) ? 'text-cream/45' : 'text-cream'}>
                {g}
              </span>
            ))}
          </p>

          <div className="relative mt-6 flex items-end justify-between gap-4 text-xs">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.2em] text-cream/55">Card holder</p>
              <p className="mt-1 truncate font-medium uppercase tracking-wider">{holder || 'Your name'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] uppercase tracking-[0.2em] text-cream/55">Expires</p>
              <p className="mt-1 font-mono tracking-wider">{expiry || 'MM/YY'}</p>
            </div>
          </div>
        </div>

        {/* back */}
        <div className={`${face} !p-0 [transform:rotateY(180deg)]`}>
          <div className="mt-6 h-11 bg-wine-950/90" />
          <div className="mx-5 mt-5 flex items-center gap-3">
            <div className="h-9 flex-1 rounded-sm bg-cream/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgba(155,28,44,0.14)_6px_8px)]" />
            <span className="flex h-9 w-16 items-center justify-center rounded-sm bg-white font-mono text-base tracking-widest text-wine-900">
              {cvc.padEnd(3, '•')}
            </span>
          </div>
          <p className="mx-5 mt-4 text-[10px] leading-snug text-cream/60">
            The 3 digits on the back of your card. Kesh never stores your card number.
          </p>
        </div>
      </div>
    </div>
  );
}
