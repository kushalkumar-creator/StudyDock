import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  gmailUser: process.env.GMAIL_USER || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
  entryCodeSecret:
    process.env.ENTRY_CODE_SECRET || 'dev-insecure-entry-code-secret-change-in-production-32chars',
  timezone: process.env.TZ || 'Asia/Kolkata',
  enableDemoReset: process.env.ENABLE_DEMO_RESET === 'true',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isEmailConfigured(): boolean {
  return Boolean(env.gmailUser && env.gmailAppPassword);
}
