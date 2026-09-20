import { archiveUrl, hasLocalSnapshot, type ArchiveEntry } from './archive';

export const siteBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export function siteUrl(path = ''): string {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return siteBase + '/';
  // Routes use trailing slashes; file assets such as favicon.svg do not.
  return siteBase + '/' + clean + (/\.[a-z0-9]{1,8}$/i.test(clean) ? '' : '/');
}

export function entryUrl(entry: Pick<ArchiveEntry, 'slug'>): string {
  return archiveUrl(entry.slug);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value + 'T12:00:00'));
}

export function sortedEntries(entries: ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title, 'pt-BR'));
}

/**
 * The article shelf includes recovered mirrors that were originally published
 * on Caelum, Alura, iMasters and other external publications. Records that
 * only point elsewhere remain available under Participações.
 */
export function articleEntries(entries: ArchiveEntry[]): ArchiveEntry[] {
  return entries.filter((entry) => entry.kind === 'article' || (entry.kind === 'external' && hasLocalSnapshot(entry)));
}

export function kindLabel(kind: ArchiveEntry['kind']): string {
  return {
    article: 'Artigo',
    podcast: 'Podcast',
    talk: 'Palestra',
    external: 'Participação',
  }[kind];
}
