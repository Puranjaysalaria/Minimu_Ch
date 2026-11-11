import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root or local .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // fallback

export interface AppConfig {
  port: number;
  nodeEnv: string;
  geminiApiKey: string;
  geminiModel: string;
  tavilyApiKey: string;
  databasePath: string;
  appTimezone: string;
  clientUrl: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  databasePath: process.env.DATABASE_PATH || './data/minimi.db',
  appTimezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    if (!config.geminiApiKey) {
      console.warn('⚠️ WARNING: GEMINI_API_KEY is not set in environment.');
    }
    if (!config.tavilyApiKey) {
      console.warn('⚠️ WARNING: TAVILY_API_KEY is not set in environment.');
    }
  }
}
