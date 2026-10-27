export interface Publication {
  id: string; title: string; authors: string[]; venue: string; year: number;
  type: string; status: string; contribution: string;
  links: {label: string; url: string}[]; citationCount?: number | null;
}
export function getPublications(curated: Publication[], snapshot: unknown, overrides: unknown): Publication[];
