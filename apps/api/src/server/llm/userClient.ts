import type { PrismaClient } from '@prisma/client';
import { readSettings } from '@/server/settings/settings';
import { OllamaClient } from './ollama';

export async function ollamaForUser(prisma: PrismaClient, userId: string): Promise<OllamaClient> {
  const settings = await readSettings(prisma, userId);
  return new OllamaClient({ chatModel: settings.modelName });
}
