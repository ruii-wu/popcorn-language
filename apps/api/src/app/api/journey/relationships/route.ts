// src/app/api/journey/relationships/route.ts
import { RelationshipCard } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { buildRelationshipCards } from '@/server/journey/relationships';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const out: RelationshipCard[] = await buildRelationshipCards(prisma, userId);
    return json(out);
  });
}
