/**
 * Security Allowlist for External Embed Players (Step 2E)
 * Strictly restricts external iframe embedding to approved experimental sources.
 * All ad-supported, blocked, or defunct domains (VidSrc, VidLink, VidCore, VixSrc, AutoEmbed, EzVidAPI)
 * have been removed from the active allowlist following iPhone Safari verification.
 */

export const TRUSTED_IFRAME_DOMAINS = [
  'embedwave.cc',
  'cinesrc.st'
] as const;

/**
 * Validates whether a given URL is safe to be embedded as an iframe.
 * Requires valid HTTPS protocol and an explicit hostname from the trusted allowlist.
 */
export function isValidExternalIframeUrl(inputUrl: string | undefined | null): boolean {
  if (!inputUrl || typeof inputUrl !== 'string') return false;

  const trimmed = inputUrl.trim();
  if (!trimmed.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check exact match or trusted subdomain
    const isAllowed = TRUSTED_IFRAME_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return false;
    }

    // Reject dangerous payload patterns in pathname or search params
    const forbidden = ['javascript:', 'data:', 'vbscript:', '<script', '%3cscript'];
    const full = (parsed.pathname + parsed.search).toLowerCase();
    for (const f of forbidden) {
      if (full.includes(f)) return false;
    }

    return true;
  } catch {
    return false;
  }
}
