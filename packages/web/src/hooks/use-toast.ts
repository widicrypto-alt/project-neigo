'use client';

import { useToast as useProjectToast } from '@/components/ui/Toast';

interface ShadcnToastInput {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const { show } = useProjectToast();

  const toast = ({ title, description, variant }: ShadcnToastInput) => {
    show({
      title,
      description,
      variant: variant === 'destructive' ? 'error' : 'info',
    });
  };

  return { toast };
}
