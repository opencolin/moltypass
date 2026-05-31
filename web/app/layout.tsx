import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Moltypass — Encrypted vault for AI API keys',
  description:
    'Moltypass holds your Anthropic, OpenAI, and Gemini keys in a local encrypted vault and proxies AI requests so the key never enters the page.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
