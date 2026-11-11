import { SourceRepository, SourceRecord } from '../database/repositories/sourceRepo.js';
import { SearchResultItem } from '../search/tavilySearch.js';

export interface FormattedCitation {
  index: number;
  id: string;
  title: string;
  url: string;
  domain: string;
  excerpt: string;
  publishedAt?: string | null;
  retrievedAt: string;
}

export class CitationService {
  constructor(private sourceRepo: SourceRepository) {}

  registerSearchResults(query: string, results: SearchResultItem[]): FormattedCitation[] {
    const citations: FormattedCitation[] = [];

    results.forEach((item, idx) => {
      let domain = '';
      try {
        domain = new URL(item.url).hostname.replace(/^www\./, '');
      } catch {
        domain = item.url;
      }

      const record = this.sourceRepo.create({
        title: item.title,
        url: item.url,
        content_excerpt: item.content.slice(0, 500),
        published_at: item.published_date,
        query,
      });

      citations.push({
        index: idx + 1,
        id: record.id,
        title: item.title,
        url: item.url,
        domain,
        excerpt: item.content.slice(0, 300),
        publishedAt: item.published_date,
        retrievedAt: record.retrieved_at,
      });
    });

    return citations;
  }

  formatCitationBlock(citations: FormattedCitation[]): string {
    if (citations.length === 0) return '';

    let block = '\n\n**Sources:**\n';
    for (const c of citations) {
      block += `[${c.index}] [${c.title}](${c.url})\n`;
    }
    return block;
  }
}
