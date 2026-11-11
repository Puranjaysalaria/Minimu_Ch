import { z } from 'zod';
import { config } from '../config/index.js';

export const WebSearchInputSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters long'),
  topic: z.string().optional().default('general'),
  time_range: z.enum(['day', 'week', 'month', 'year']).optional(),
  max_results: z.number().int().min(1).max(10).optional().default(5),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string | null;
}

export interface WebSearchOutput {
  query: string;
  results: SearchResultItem[];
  error?: string;
}

// Mock search provider registry for deterministic offline tests
type MockSearchHandler = (input: WebSearchInput) => Promise<WebSearchOutput> | WebSearchOutput;
let mockSearchHandler: MockSearchHandler | null = null;

export function setMockSearchHandler(handler: MockSearchHandler | null): void {
  mockSearchHandler = handler;
}

export async function executeWebSearch(input: WebSearchInput): Promise<WebSearchOutput> {
  // Validate input schema
  const parsed = WebSearchInputSchema.parse(input);

  // If a mock is registered (e.g. during automated tests), invoke it directly
  if (mockSearchHandler) {
    return mockSearchHandler(parsed);
  }

  const apiKey = config.tavilyApiKey;
  if (!apiKey) {
    return {
      query: parsed.query,
      results: [],
      error: 'TAVILY_API_KEY is not configured on the server. Cannot execute live web search.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: parsed.query,
        topic: parsed.topic || 'general',
        time_range: parsed.time_range,
        max_results: parsed.max_results || 5,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return {
        query: parsed.query,
        results: [],
        error: `Tavily Search API returned error HTTP ${response.status}: ${errText.slice(0, 100)}`,
      };
    }

    const data = (await response.json()) as {
      results?: Array<{
        title: string;
        url: string;
        content: string;
        score?: number;
        published_date?: string;
      }>;
    };

    const rawResults = data.results || [];

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const normalized: SearchResultItem[] = [];

    for (const item of rawResults) {
      if (!item.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      normalized.push({
        title: item.title || 'Untitled Source',
        url: item.url,
        content: item.content || '',
        score: item.score,
        published_date: item.published_date || null,
      });
    }

    return {
      query: parsed.query,
      results: normalized,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        query: parsed.query,
        results: [],
        error: 'Web search request timed out after 9000ms.',
      };
    }
    return {
      query: parsed.query,
      results: [],
      error: `Web search execution failed: ${error.message || 'Unknown network error'}`,
    };
  }
}
