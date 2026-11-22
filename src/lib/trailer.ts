/** Returns the 11-character YouTube video id from a normal YouTube link, or null if it is not one. */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id: string | null = null;

    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        id = u.searchParams.get('v');
      } else {
        const match = u.pathname.match(/^\/(embed|shorts|v)\/([^/?]+)/);
        if (match) id = match[2];
      }
    }

    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}