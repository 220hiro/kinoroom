/**
 * Security Allowlist for External Embed Players
 * Prevents arbitrary iframe injection, SSRF, XSS, and unauthorized external redirection.
 */

export const TRUSTED_IFRAME_DOMAINS = [
  'embedwave.cc',
  'vidcore.org',
  'vidlink.pro',
  'vidsrc.hair',
  'vixsrc.to',
  'autoembed.cc',
  'ezvidapi.com',
  'vidsrc.sh',
  'vidsrc.to',
  'vidsrc.xyz',
  'vidsrc.in',
  'vidsrc.pm',
  'vidsrc.net',
  'kodik.info',
  'kodikplayer.com',
  'kodik.cc',
  'kodik.biz',
  'kodikonline.com',
  'aniqit.com',
  'kinobox.tv'
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

    // Check exact match or trusted subdomain (e.g. sub.vidsrc.sh)
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
