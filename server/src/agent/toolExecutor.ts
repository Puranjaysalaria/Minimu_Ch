import { executeWebSearch, WebSearchInput, WebSearchInputSchema, SearchResultItem } from '../search/tavilySearch.js';
import { CitationService, FormattedCitation } from '../citations/citationService.js';

export interface ToolExecutionResult {
  toolName: string;
  output: Record<string, unknown>;
  citations: FormattedCitation[];
  error?: string;
}

export class ToolExecutor {
  constructor(private citationService: CitationService) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    if (toolName !== 'web_search') {
      return {
        toolName,
        output: { error: `Unsupported tool: '${toolName}'. Only 'web_search' is supported.` },
        citations: [],
        error: `Tool '${toolName}' is not allowed.`,
      };
    }

    try {
      const parsedArgs = WebSearchInputSchema.parse(args) as WebSearchInput;
      const searchOutput = await executeWebSearch(parsedArgs);

      if (searchOutput.error) {
        return {
          toolName,
          output: {
            status: 'error',
            message: searchOutput.error,
            results: [],
          },
          citations: [],
          error: searchOutput.error,
        };
      }

      // Register sources in database and generate formatted citations
      const citations = this.citationService.registerSearchResults(
        searchOutput.query,
        searchOutput.results
      );

      // Return sanitized results for Gemini to read
      const sanitizedResults = searchOutput.results.map((r, i) => ({
        source_index: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 800),
        published_date: r.published_date || undefined,
      }));

      return {
        toolName,
        output: {
          status: 'success',
          query: searchOutput.query,
          result_count: sanitizedResults.length,
          evidence: sanitizedResults,
        },
        citations,
      };
    } catch (err: any) {
      return {
        toolName,
        output: { status: 'error', message: err.message || 'Validation error' },
        citations: [],
        error: err.message,
      };
    }
  }
}
