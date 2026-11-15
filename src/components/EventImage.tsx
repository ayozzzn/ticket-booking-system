import { Ticket } from 'lucide-react';

interface EventImageProps {
  src: string | null;
  alt: string;
  className?: string;
}

export default function EventImage({ src, alt, className = '' }: EventImageProps) {
  if (!src) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-wine-800 via-crimson to-wine-900 ${className}`}
      >
        <Ticket className="h-12 w-12 text-gold" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`h-full w-full object-cover transition duration-700 ${className}`}
    />
  );
}