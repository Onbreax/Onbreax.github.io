import { getChatGPTUser } from '../../chatgpt-auth';
import { oddsRelay } from '../../../lib/odds-relay.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  return oddsRelay(request, { authenticated: !!user });
}
