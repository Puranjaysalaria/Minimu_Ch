import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';

export interface ModelMessagePart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface ModelContent {
  role: 'user' | 'model';
  parts: ModelMessagePart[];
}

export interface GenerateContentParams {
  systemInstruction?: string;
  contents: ModelContent[];
  tools?: any[];
}

export interface GenerateContentResult {
  text?: string;
  functionCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}

// Mock handler for deterministic offline tests
type MockGeminiHandler = (params: GenerateContentParams) => Promise<GenerateContentResult> | GenerateContentResult;
let mockGeminiHandler: MockGeminiHandler | null = null;

export function setMockGeminiHandler(handler: MockGeminiHandler | null): void {
  mockGeminiHandler = handler;
}

export class GeminiClient {
  private ai: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    this.modelName = config.geminiModel || 'gemini-2.5-flash';
    if (config.geminiApiKey) {
      this.ai = new GoogleGenAI({
        apiKey: config.geminiApiKey,
      });
    }
  }

  isAvailable(): boolean {
    return !!this.ai || !!mockGeminiHandler;
  }

  async generate(params: GenerateContentParams): Promise<GenerateContentResult> {
    if (mockGeminiHandler) {
      return mockGeminiHandler(params);
    }

    if (!this.ai) {
      throw new Error(
        'GEMINI_API_KEY is not configured in the server environment. Please set GEMINI_API_KEY in your .env file.'
      );
    }

    const contents = params.contents.map(c => ({
      role: c.role,
      parts: c.parts.map(p => {
        if (p.functionCall) {
          return { functionCall: p.functionCall };
        }
        if (p.functionResponse) {
          return { functionResponse: p.functionResponse };
        }
        return { text: p.text || '' };
      }),
    }));

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: params.systemInstruction,
        tools: params.tools ? params.tools : undefined,
      },
    });

    const functionCalls = response.functionCalls
      ?.filter(fc => !!fc.name)
      .map(fc => ({
        name: fc.name as string,
        args: (fc.args as Record<string, unknown>) || {},
      }));

    return {
      text: response.text || '',
      functionCalls: functionCalls && functionCalls.length > 0 ? functionCalls : undefined,
    };
  }
}
