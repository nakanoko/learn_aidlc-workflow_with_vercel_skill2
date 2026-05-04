import type { ReactNode } from 'react';

export const metadata = {
  title: 'Invoice Backend API',
  description: 'API for invoice check & approval system',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
