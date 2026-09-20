import archiveSource from '../data/archive.json';
import recoveredSource from '../data/posts-recovered.json';

export type ArchiveKind = 'article' | 'podcast' | 'talk' | 'external';

export interface ArchiveEntry {
  slug: string;
  title: string;
  date: string | null;
  kind: ArchiveKind;
  category: string;
  description: string;
  html: string;
  originalUrl?: string;
  archiveUrl?: string;
  waybackUrl?: string;
  archiveLookupUrl?: string;
  recoveryStatus?: string;
  recoverySource?: string;
  captureQuality?: string;
  mirrorHtml?: string;
  snapshotHtml?: string;
  sourcePath: string;
  originalDate?: string;
  legacyCss?: string;
  legacyScript?: string;
  fullPage?: boolean;
  feedWarning?: string;
  [key: string]: unknown;
}

type PartialEntry = Partial<ArchiveEntry> & { slug: string };

function eagerJson(path: string): unknown {
  const modules = import.meta.glob('../data/*.json', { eager: true, import: 'default' });
  const module = modules[path];
  return module;
}

const mirrorsValue = eagerJson('../data/mirrors.json');
const newPodcastsValue = eagerJson('../data/podcasts-new.json');

const mirrors: Record<string, Partial<ArchiveEntry>> = mirrorsValue && typeof mirrorsValue === 'object' && !Array.isArray(mirrorsValue)
  ? mirrorsValue as Record<string, Partial<ArchiveEntry>>
  : {};

const additionalPodcasts: PartialEntry[] = Array.isArray(newPodcastsValue)
  ? newPodcastsValue as PartialEntry[]
  : [];

const recoveredEntries: PartialEntry[] = Array.isArray(recoveredSource)
  ? recoveredSource as PartialEntry[]
  : [];

function normalizeEntry(value: PartialEntry): ArchiveEntry {
  const recoveredHtml = value.html || value.mirrorHtml || value.snapshotHtml || '';
  return {
    slug: value.slug,
    title: value.title || value.slug,
    date: value.date || null,
    kind: value.kind || 'podcast',
    category: value.category || value.kind || 'podcast',
    description: value.description || '',
    html: recoveredHtml,
    sourcePath: value.sourcePath || 'external/new',
    ...value,
  } as ArchiveEntry;
}

function applyMirror(entry: PartialEntry): ArchiveEntry {
  const override = mirrors[entry.slug] || {};
  return normalizeEntry({ ...entry, ...override, slug: entry.slug });
}

export const entries: ArchiveEntry[] = [
  ...(archiveSource as ArchiveEntry[]),
  ...recoveredEntries.filter((entry) => !(archiveSource as ArchiveEntry[]).some((existing) => existing.slug === entry.slug)),
  ...additionalPodcasts.filter((podcast) => !(archiveSource as ArchiveEntry[]).some((entry) => entry.slug === podcast.slug)),
].map(applyMirror);

export const articles = entries.filter((entry) => entry.kind === 'article');
export const podcasts = entries.filter((entry) => entry.kind === 'podcast');
export const talks = entries.filter((entry) => entry.kind === 'talk');
export const external = entries.filter((entry) => entry.kind === 'external');

export function getEntry(slug: string): ArchiveEntry | undefined {
  return entries.find((entry) => entry.slug === slug);
}

export function entriesForKind(kind: ArchiveKind): ArchiveEntry[] {
  return entries.filter((entry) => entry.kind === kind);
}

export function yearOf(entry: ArchiveEntry): number | null {
  const match = entry.date?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export const years = [...new Set(entries.map(yearOf).filter((year): year is number => year !== null))].sort((a, b) => b - a);

export function entriesForYear(year: number, kind?: ArchiveKind): ArchiveEntry[] {
  return entries.filter((entry) => yearOf(entry) === year && (!kind || entry.kind === kind));
}

export function archiveUrl(slug: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${slug.replace(/^\/+|\/+$/g, '')}/`;
}

export function originalOrArchiveUrl(entry: ArchiveEntry): string | undefined {
  return entry.originalUrl || waybackUrl(entry);
}

/**
 * A recovered mirror is rendered at the local entry URL. `archiveUrl` is the
 * historical Wayback capture URL and must remain a separate outbound link.
 */
export function waybackUrl(entry: ArchiveEntry): string | undefined {
  return entry.waybackUrl || entry.archiveUrl || entry.archiveLookupUrl;
}

export function hasLocalSnapshot(entry: ArchiveEntry): boolean {
  const html = (entry.html || entry.mirrorHtml || entry.snapshotHtml || '').trim();
  if (!html) return false;
  return !/Este registro preserva a participa(?:ç|c)ão publicada originalmente/i.test(html)
    && !/Registro preservado no arquivo\.\s*<a/i.test(html);
}

/**
 * Old DocPad content used root-relative asset links. Rewrite only those
 * internal links so the same snapshot works on the GitHub Pages project URL
 * and on the eventual custom domain. External links remain untouched.
 */
export function htmlForEntry(entry: ArchiveEntry): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  let html = entry.html
    // The recovered external pages sometimes include WordPress analytics
    // attributes. Their visible links and prose remain intact without firing
    // those historical trackers in the new archive.
    .replace(/\s+onclick=(['"])[\s\S]*?(?:__gaTracker|ga\(|analytics|track)[\s\S]*?\1/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*(?:facebook\.com\/plugins|twitter\.com|platform\.twitter)[^>]*>[\s\S]*?<\/iframe>/gi, '');

  const waybackAsset = (raw: string, attribute: string): string | undefined => {
    if (entry.kind !== 'external' || !entry.originalUrl || !waybackUrl(entry)) return undefined;
    // Recovered assets are already committed under /mirrors. They must stay
    // local; sending them through Wayback produces a URL that looks valid but
    // points at a replay of a path that never existed on the source site.
    if (/^(?:\/?(?:[^/]+\/)?mirrors)\//i.test(raw.trim())) return undefined;
    if (attribute.toLowerCase() !== 'src' && attribute.toLowerCase() !== 'poster' && !/\.(?:css|js|png|jpe?g|gif|svg|webp|mp4|webm)(?:[?#].*)?$/i.test(raw)) return undefined;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|data:|#)/i.test(raw)) return undefined;
    try {
      const page = new URL(entry.originalUrl);
      const resolved = new URL(raw, entry.originalUrl);
      const capture = waybackUrl(entry)?.match(/https?:\/\/web\.archive\.org\/web\/(\d+)/i);
      if (!capture) return undefined;
      const directory = page.pathname.endsWith('/') ? page.pathname : `${page.pathname.replace(/[^/]+$/, '')}`;
      const assetPath = raw.startsWith('/') ? raw : new URL(raw, `${page.origin}${directory}`).pathname;
      return `https://web.archive.org/web/${capture[1]}im_/${resolved.protocol}//${resolved.host}${assetPath}${resolved.search}`;
    } catch {
      return undefined;
    }
  };

  const localUrl = (raw: string): string => raw.replace(/^\/(?!\/)/, prefix);

  html = html.replace(/\b(src|href|poster|action)=(['"])(.*?)\2/gi, (match, attribute, quote, raw) => {
    const recovered = waybackAsset(raw, attribute);
    if (recovered) return `${attribute}=${quote}${recovered}${quote}`;
    return `${attribute}=${quote}${localUrl(raw)}${quote}`;
  });
  html = html.replace(/\b(srcset|imagesrcset)=(['"])(.*?)\2/gi, (match, attribute, quote, raw) => {
    const values = raw.split(',').map((candidate: string) => {
      const parts = candidate.trim().split(/\s+/);
      if (!parts[0]) return candidate;
      const recovered = waybackAsset(parts[0], attribute);
      parts[0] = recovered || localUrl(parts[0]);
      return parts.join(' ');
    });
    return `${attribute}=${quote}${values.join(', ')}${quote}`;
  });
  return html;
}
