import historySource from '../data/talks-history.json';
import newSource from '../data/talks-new.json';
import enrichmentsSource from '../data/talks-enrichments.json';

export type TalkLinkType = 'slides' | 'recording' | 'internal' | 'document' | 'external' | 'official-event' | 'reportage' | 'event-page' | 'post-event-recap' | 'corroboration' | 'self-report' | 'recording-or-course' | 'official-recap';

export interface TalkLink {
  label: string;
  url: string;
  type: TalkLinkType;
  localPath?: string;
  archiveSlug?: string;
}

export interface TalkRecord {
  id: string;
  year: number;
  date: string | null;
  dateLabel: string | null;
  datePrecision: 'day' | 'month' | 'year' | 'range';
  month: number | null;
  day: number | null;
  sortKey: string;
  event: string;
  title: string;
  links: TalkLink[];
  notes?: string[];
  relatedEntrySlugs?: string[];
  sourceLine?: number;
  source?: string;
}

type TalkEnrichment = Pick<TalkRecord, 'links'>;

function normalize(value: unknown): TalkRecord {
  const talk = value as Partial<TalkRecord>;
  return {
    id: talk.id || `talk-${talk.year || 'unknown'}-${talk.event || 'registro'}`,
    year: talk.year || 0,
    date: talk.date || null,
    dateLabel: talk.dateLabel || null,
    datePrecision: talk.datePrecision || 'year',
    month: talk.month || null,
    day: talk.day || null,
    sortKey: talk.sortKey || String(talk.year || 0),
    event: talk.event || 'Evento não informado',
    title: talk.title || 'Palestra sem título',
    links: Array.isArray(talk.links) ? talk.links as TalkLink[] : [],
    ...(talk.notes?.length ? { notes: talk.notes } : {}),
    ...(talk.relatedEntrySlugs?.length ? { relatedEntrySlugs: talk.relatedEntrySlugs } : {}),
    ...(talk.sourceLine ? { sourceLine: talk.sourceLine } : {}),
    ...(talk.source ? { source: talk.source } : {}),
  };
}

const enrichments = enrichmentsSource as Record<string, TalkEnrichment>;

export const historicTalks = (historySource as TalkRecord[]).map(normalize).map((talk) => ({
  ...talk,
  source: 'legacy',
  links: [...talk.links, ...(enrichments[talk.id]?.links || [])],
}));
export const newTalks = (newSource as TalkRecord[]).map(normalize);
export const talks = [...historicTalks, ...newTalks];

export const historicTalksWithoutSourceLinks = (historySource as TalkRecord[]).filter((talk) => !talk.links?.length).length;

export const talkYears = [...new Set(talks.map((talk) => talk.year).filter(Boolean))].sort((a, b) => b - a);

export function sortedTalks(records: TalkRecord[]): TalkRecord[] {
  return [...records].sort((a, b) => b.sortKey.localeCompare(a.sortKey) || b.year - a.year || a.event.localeCompare(b.event, 'pt-BR'));
}

export function talksForYear(year: number): TalkRecord[] {
  return sortedTalks(talks.filter((talk) => talk.year === year));
}

export function talkDateLabel(talk: TalkRecord): string {
  return talk.dateLabel || String(talk.year);
}
