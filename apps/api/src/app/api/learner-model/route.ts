import type { LearnerModelResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { computeLearnerModel } from '@/server/learning/aggregate';
import { practiceAdviceFor } from '@/server/learning/advice';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const model = await computeLearnerModel({ prisma, userId });
    const out: LearnerModelResponse = {
      skills: model.skills.map((s) => ({
        skillCode: s.skillCode,
        category: s.category,
        labelEn: s.labelEn,
        labelZh: s.labelZh,
        level: Number(s.level.toFixed(4)),
        evidenceN: s.evidenceN,
        successCount: s.successCount,
        mistakeCount: s.mistakeCount,
        status: s.status,
        trend: s.trend,
        lastObservedAt: s.lastObservedAt ? s.lastObservedAt.toISOString() : null,
        practiceAdvice: practiceAdviceFor(s.skillCode),
      })),
      focus: model.focus.map((s) => ({
        skillCode: s.skillCode,
        category: s.category,
        labelEn: s.labelEn,
        labelZh: s.labelZh,
        level: Number(s.level.toFixed(4)),
        evidenceN: s.evidenceN,
        successCount: s.successCount,
        mistakeCount: s.mistakeCount,
        status: s.status,
        trend: s.trend,
        lastObservedAt: s.lastObservedAt ? s.lastObservedAt.toISOString() : null,
        practiceAdvice: practiceAdviceFor(s.skillCode),
      })),
    };
    return json(out);
  });
}
