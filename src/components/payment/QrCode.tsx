import { useMemo } from 'react';
import { makeQr } from '@/lib/qr';

interface QrCodeProps {
  text: string;
  /** Pixel size of the drawing (it scales with CSS anyway). */
  size?: number;
  label?: string;
  className?: string;
}

/** Draws a QR code as one SVG path (sharp at any size). Dark modules use the wine colour. */
export default function QrCode({ text, size = 220, label = 'QR code', className = '' }: QrCodeProps) {
  const { path, count } = useMemo(() => {
    const grid = makeQr(text);
    let d = '';
    grid.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`; // 4 modules of quiet zone
      }),
    );
    return { path: d, count: grid.length + 8 };
  }, [text]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={count} height={count} fill="#ffffff" />
      <path d={path} fill="#2b0709" />
    </svg>
  );
}
