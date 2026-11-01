import { getCollection } from 'astro:content';

// Unpublished works stay visible in `npm run dev` for review. Production builds get no page or
// link for them, and astro.config.mjs removes their image files from dist.
export async function getWorks() {
  const works = await getCollection('works', (w) => import.meta.env.DEV || w.data.public);
  return works.sort((a, b) => a.data.order - b.data.order);
}

export function youtubeId(url?: string) {
  return url?.match(/(?:youtu\.be\/|[?&]v=)([\w-]{11})/)?.[1];
}

export function paragraphs(text = '') {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
