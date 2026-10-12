import { NextRequest, NextResponse } from 'next/server';
import {
  ExternalSourceRegistry,
  ExternalSourcesRequest,
  ExternalAdapterId
} from '@/lib/services/externalSources';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tmdbIdParam = searchParams.get('tmdbId');

    if (!tmdbIdParam) {
      return NextResponse.json(
        { success: false, error: 'MISSING_PARAM', message: 'Parameter tmdbId is required' },
        { status: 400 }
      );
    }

    const tmdbId = parseInt(tmdbIdParam, 10);
    if (isNaN(tmdbId) || tmdbId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PARAM', message: 'Parameter tmdbId must be a positive integer' },
        { status: 400 }
      );
    }

    const type = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
    const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : 1;
    const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!, 10) : 1;
    const shouldProbe = searchParams.get('probe') === 'true';
    const singleProviderId = searchParams.get('providerId') as ExternalAdapterId | null;

    const reqData: ExternalSourcesRequest = {
      tmdbId,
      type,
      season,
      episode
    };

    if (singleProviderId) {
      const provider = ExternalSourceRegistry.getProvider(singleProviderId, reqData);
      if (!provider) {
        return NextResponse.json(
          { success: false, error: 'PROVIDER_NOT_FOUND', message: `Provider ${singleProviderId} not found` },
          { status: 404 }
        );
      }

      if (shouldProbe) {
        const probeResult = await ExternalSourceRegistry.probeProvider(singleProviderId, reqData);
        provider.availabilityStatus = probeResult.status;
        provider.diagnostics = probeResult.details;
      }

      return NextResponse.json({
        success: true,
        tmdbId,
        type,
        provider
      });
    }

    const providers = ExternalSourceRegistry.getStep2DProviders(reqData);

    if (shouldProbe) {
      await Promise.all(
        providers.map(async (p) => {
          const probeResult = await ExternalSourceRegistry.probeProvider(p.id, reqData);
          p.availabilityStatus = probeResult.status;
          p.diagnostics = probeResult.details;
        })
      );
    }

    return NextResponse.json({
      success: true,
      tmdbId,
      type,
      season,
      episode,
      providers
    });
  } catch (err: any) {
    console.error('[Providers API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'SERVER_ERROR', message: err?.message || 'Failed to resolve providers' },
      { status: 500 }
    );
  }
}
