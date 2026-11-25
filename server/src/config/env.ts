import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  brevoApiKey: process.env.BREVO_API_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || process.env.GMAIL_USER || '',
  gmailUser: process.env.GMAIL_USER || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
  entryCodeSecret:
    process.env.ENTRY_CODE_SECRET || 'dev-insecure-entry-code-secret-change-in-production-32chars',
  timezone: process.env.TZ || 'Asia/Kolkata',
  enableDemoReset: process.env.ENABLE_DEMO_RESET === 'true',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export type EmailProvider = 'brevo' | 'resend' | 'gmail-smtp' | 'none';

export function getEmailProvider(): EmailProvider {
  if (env.brevoApiKey.trim() && env.emailFrom.trim()) return 'brevo';
  if (env.resendApiKey.trim()) return 'resend';
  if (env.gmailUser.trim() && env.gmailAppPassword.trim()) return 'gmail-smtp';
  return 'none';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isEmailConfigured(): boolean {
  return getEmailProvider() !== 'none';
}
