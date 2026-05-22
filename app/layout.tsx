import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Popcorn Language',
  description: 'Local-LLM-powered bilingual language-learning platform.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          background: '#FAF7F2',
          color: '#1F1B16',
        }}
      >
        {children}
      </body>
    </html>
  );
}
