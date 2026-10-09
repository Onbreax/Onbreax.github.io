import { getChatGPTUser } from '../../chatgpt-auth';
import { relay } from '../../../lib/football-relay.mjs';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  return relay(request, { authenticated: !!user });
}
