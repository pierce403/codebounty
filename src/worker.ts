export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/meta' && request.method === 'GET') {
      return Response.json({
        name: 'Codebounty',
        mode: 'demo',
        storage: 'browser-local',
        githubConnected: false,
        paymentsEnabled: false,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (pathname === '/api/auth/session' && request.method === 'GET') {
      return Response.json({
        authenticated: false,
        provider: 'github',
        availability: 'not_configured',
        mode: 'demo',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (pathname === '/api/auth/github/start' && request.method === 'GET') {
      return Response.json({
        error: 'GitHub sign-in is not configured for this demo.',
        mode: 'demo',
      }, { status: 501, headers: { 'Cache-Control': 'no-store' } });
    }

    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
