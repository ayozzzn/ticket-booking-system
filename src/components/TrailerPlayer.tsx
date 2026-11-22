import { Play } from 'lucide-react';
import { useState } from 'react';
import { getYouTubeId } from '@/lib/trailer';

interface TrailerPlayerProps {
  url: string | null | undefined;
  title: string;
}

export default function TrailerPlayer({ url, title }: TrailerPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const id = getYouTubeId(url);
  if (!id) return null;

  return (
    <div className="relative aspect-video overflow-hidden rounded-3xl bg-wine-800 shadow-2xl shadow-black/50 ring-1 ring-gold/25">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`${title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play trailer for ${title}`}
          className="group absolute inset-0 h-full w-full"
        >
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
          <span className="absolute inset-0 bg-black/35" aria-hidden="true" />
          <span className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-crimson text-cream shadow-xl transition group-hover:scale-110 group-hover:bg-crimson-bright">
            <Play className="ml-1 h-9 w-9" fill="currentColor" aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}