import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryClient } from './queryClient';
import { ThemeProvider } from './ThemeProvider';
import { AdsProvider } from '@/ads/AdsContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><AdsProvider>{children}</AdsProvider></ThemeProvider>
    </QueryClientProvider>
  );
}
