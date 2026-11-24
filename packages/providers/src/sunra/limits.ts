import { DEFAULT_IMAGE_LIMITS, type ImageLimits } from '@sunnygen/core'

/**
 * Sunra documents no maximum size for a file it fetches from an input URL: the file-upload page
 * only caps the JSON body and says uploads have "no size limit enforced yet", and the error page
 * says `input_fetch_failed` fires for "a file over the size limit" without naming one. In
 * practice 7.6 MB fetched fine and an 18.1 MB board was rejected, so this is a conservative
 * ceiling under that gap: an oversized input is re-encoded for the upload only.
 */
export const SUNRA_IMAGE_LIMITS: ImageLimits = {
  ...DEFAULT_IMAGE_LIMITS,
  bytes: 6 * 1024 * 1024,
}
