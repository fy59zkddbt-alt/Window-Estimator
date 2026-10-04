// Future server-only signature verification + durable event deduplication boundary.
// Never acknowledge OK{InvId} before verified, transactional processing exists.
Deno.serve(() => new Response('Result processing is not implemented', { status: 503,
  headers: { 'Cache-Control': 'no-store' } }));
