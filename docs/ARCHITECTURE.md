# KinoRoom · architecture map

Browser → Next.js route handlers → provider services → authorized upstream APIs.

- `src/app`: home, title, watch, library, vocabulary, profiles and private access routes.
- `src/components`: accessible UI; player and study controls are separate components.
- `src/lib/providers`: replaceable MetadataProvider, MediaSourceProvider, SubtitleProvider, TranslationProvider.
- `src/lib/services`: bounded TTL cache, parallel discovery, source scoring and provider health.
- `src/lib/storage.tsx`: versioned per-profile browser storage; no backend database required.
- `src/lib/subtitles.ts`: SRT, WebVTT and ASS/SSA cue normalization, shared by overlays and transcript.

Metadata identifies the title; it never implies permission to stream it. Sources match exact IDs, including season and episode. Open film catalog is real licensed media, explicitly labeled as demo when no TMDB key exists. No arbitrary title is mapped to a test video.

Shaka handles adaptive media and audio; the app overlays two independent subtitle timelines. Server API secrets never enter client bundles. Direct media bytes travel from source to browser, not through the app server. Third-party subtitle downloads use a bounded, allowlisted server fetch. Cache is bounded and in-memory on the server; user progress/preferences/vocabulary persist locally.

No sync, AI billing, paid TTS, scraping, DRM handling, or publication. Private sharing uses a common password and signed HttpOnly cookie; profiles are local identities, not separate accounts. Local-only mode works without a password. Cloudflare Workers deployment is documented as an optional operation.
