import { describe, expect, it } from 'vitest';
import worker from './worker';

const env = {} as Env;

describe('demo Worker API', () => {
  it('reports explicitly disabled integrations', async () => {
    const response = await worker.fetch(new Request('https://codebounty.example/api/meta'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: 'demo', storage: 'browser-local', githubConnected: false, paymentsEnabled: false,
    });
  });

  it('does not imply a GitHub session or start OAuth', async () => {
    const session = await worker.fetch(new Request('https://codebounty.example/api/auth/session'), env);
    expect(await session.json()).toMatchObject({ authenticated: false, availability: 'not_configured' });
    const start = await worker.fetch(new Request('https://codebounty.example/api/auth/github/start'), env);
    expect(start.status).toBe(501);
    expect(start.headers.get('location')).toBeNull();
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await worker.fetch(new Request('https://codebounty.example/api/unknown'), env);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'Not found' });
  });
});
