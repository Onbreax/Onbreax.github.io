import { getChatGPTUser } from '../../chatgpt-auth';
import { handleSports } from '../../../lib/sports-relay.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  return handleSports(request, { authenticated: !!user });
}
export function GET() {
  return new Response('POST uniquement', { status: 405, headers: { 'Cache-Control': 'no-store' } });
}
