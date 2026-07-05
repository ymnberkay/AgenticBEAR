import { useQuery } from '@tanstack/react-query';
import type { PublicConfig } from '@subagent/shared';
import { apiGet } from '../client';

/** Sensible fallbacks matching the server defaults — used until /api/config resolves. */
export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  uploads: {
    maxImageMb: 20, maxAudioMb: 25, maxVideoMb: 40,
    maxImages: 4, maxAudioClips: 2, maxVideos: 1,
  },
  bodyLimitMb: 64,
};

/**
 * Public runtime config (operator-set upload limits). Cached indefinitely — it only
 * changes on a server redeploy. Falls back to DEFAULT_PUBLIC_CONFIG while loading / on error.
 */
export function usePublicConfig(): PublicConfig {
  const { data } = useQuery({
    queryKey: ['public-config'],
    queryFn: () => apiGet<PublicConfig>('/api/config'),
    staleTime: Infinity,
    retry: 1,
  });
  return data ?? DEFAULT_PUBLIC_CONFIG;
}
