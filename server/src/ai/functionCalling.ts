import { Type, FunctionDeclaration } from '@google/genai';

export const webSearchToolDeclaration: FunctionDeclaration = {
  name: 'web_search',
  description:
    'Search the live web for current real-time information, latest pricing, software release versions, feature availability, or company updates. Use this tool when answering questions about current facts or when comparing past historical discussion with present ground truth.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The exact targeted search query (e.g., "current subscription price of Service X", "Release notes for version Y").',
      },
      topic: {
        type: Type.STRING,
        description: 'Category for the search: general, news, or finance.',
      },
      time_range: {
        type: Type.STRING,
        description: 'Optional time range constraint: day, week, month, or year.',
      },
    },
    required: ['query'],
  },
};
