'use client';

import { useEffect } from 'react';
import { Button } from '@am/ui';

/**
 * Reloads the page the person was trying to reach; the offline page is being shown in its place,
 * at that page's address. It also reloads by itself when the connection comes back.
 */
export function RetryButton({ children }: { children: string }) {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, []);

  return (
    <Button variant="primary" iconStart="refresh" onClick={() => window.location.reload()}>
      {children}
    </Button>
  );
}
