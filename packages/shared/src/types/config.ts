/**
 * Public runtime config served at GET /api/config (no auth). Lets the client read
 * operator-set limits (via server env / Helm values) instead of compiling them in.
 */
export interface UploadLimits {
  /** Max size per file, in megabytes. */
  maxImageMb: number;
  maxAudioMb: number;
  maxVideoMb: number;
  /** Max attachments per turn, by kind. */
  maxImages: number;
  maxAudioClips: number;
  maxVideos: number;
}

export interface PublicConfig {
  uploads: UploadLimits;
  /** Server request-body cap (MB) — the hard ceiling any single attachment must fit under. */
  bodyLimitMb: number;
}
