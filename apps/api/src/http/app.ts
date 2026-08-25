import { Hono } from 'hono';
import { adapt } from './adapt';

import * as authLogin from '@/app/api/auth/login/route';
import * as authLogout from '@/app/api/auth/logout/route';
import * as authRegister from '@/app/api/auth/register/route';
import * as authMe from '@/app/api/auth/me/route';
import * as profile from '@/app/api/profile/route';
import * as onboardingComplete from '@/app/api/onboarding/complete/route';
import * as npcs from '@/app/api/npcs/route';
import * as npcById from '@/app/api/npcs/[id]/route';
import * as threadByNpc from '@/app/api/threads/[npcId]/route';
import * as threadMessages from '@/app/api/threads/[npcId]/messages/route';
import * as threadMessageById from '@/app/api/threads/[npcId]/messages/[msgId]/route';
import * as correction from '@/app/api/threads/[npcId]/messages/[msgId]/correction/route';
import * as scenarioCatalog from '@/app/api/scenarios/catalog/route';
import * as scenarioSessions from '@/app/api/scenarios/sessions/route';
import * as scenarioSession from '@/app/api/scenarios/sessions/[id]/route';
import * as scenarioAccept from '@/app/api/scenarios/sessions/[id]/accept/route';
import * as scenarioDecline from '@/app/api/scenarios/sessions/[id]/decline/route';
import * as scenarioChoose from '@/app/api/scenarios/sessions/[id]/choose/route';
import * as scenarioFreetype from '@/app/api/scenarios/sessions/[id]/freetype/route';
import * as scenarioAbort from '@/app/api/scenarios/sessions/[id]/abort/route';
import * as scenarioPause from '@/app/api/scenarios/sessions/[id]/pause/route';
import * as scenarioResume from '@/app/api/scenarios/sessions/[id]/resume/route';
import * as scenarioComplete from '@/app/api/scenarios/sessions/[id]/complete/route';
import * as memories from '@/app/api/memories/route';
import * as memoriesRecent from '@/app/api/memories/recent/route';
import * as memoryById from '@/app/api/memories/[id]/route';
import * as journeySummary from '@/app/api/journey/summary/route';
import * as journeyRelationships from '@/app/api/journey/relationships/route';
import * as journeyStreak from '@/app/api/journey/streak/route';
import * as achievements from '@/app/api/achievements/route';
import * as achievementsGenerate from '@/app/api/achievements/generate/route';
import * as settings from '@/app/api/settings/route';
import * as systemHealth from '@/app/api/system/health/route';
import * as systemModels from '@/app/api/system/models/route';
import * as systemReset from '@/app/api/system/reset/route';
import * as devMemoryEval from '@/app/api/dev/memory-eval/route';
import * as learnerModel from '@/app/api/learner-model/route';
import * as scenarioRecommendation from '@/app/api/scenarios/recommendation/route';
import * as scenarioRecommendationDismiss from '@/app/api/scenarios/recommendation/dismiss/route';
import * as scenarioTemplateStart from '@/app/api/scenarios/templates/[id]/start/route';

export const app = new Hono();

// auth
app.post('/api/auth/login', adapt(authLogin.POST));
app.post('/api/auth/logout', adapt(authLogout.POST));
app.post('/api/auth/register', adapt(authRegister.POST));
app.get('/api/auth/me', adapt(authMe.GET));

// profile / onboarding
app.get('/api/profile', adapt(profile.GET));
app.put('/api/profile', adapt(profile.PUT));
app.post('/api/onboarding/complete', adapt(onboardingComplete.POST));

// npcs
app.get('/api/npcs', adapt(npcs.GET));
app.get('/api/npcs/:id', adapt(npcById.GET));

// threads
app.delete('/api/threads/:npcId', adapt(threadByNpc.DELETE));
app.get('/api/threads/:npcId/messages', adapt(threadMessages.GET));
app.post('/api/threads/:npcId/messages', adapt(threadMessages.POST)); // SSE
app.delete('/api/threads/:npcId/messages/:msgId', adapt(threadMessageById.DELETE));
app.post('/api/threads/:npcId/messages/:msgId/restore', adapt(threadMessageById.POST));
app.post('/api/threads/:npcId/messages/:msgId/correction', adapt(correction.POST));

// scenarios
app.get('/api/scenarios/catalog', adapt(scenarioCatalog.GET));
app.get('/api/scenarios/sessions', adapt(scenarioSessions.GET));
app.get('/api/scenarios/sessions/:id', adapt(scenarioSession.GET));
app.post('/api/scenarios/sessions/:id/accept', adapt(scenarioAccept.POST));
app.post('/api/scenarios/sessions/:id/decline', adapt(scenarioDecline.POST));
app.post('/api/scenarios/sessions/:id/choose', adapt(scenarioChoose.POST)); // SSE
app.post('/api/scenarios/sessions/:id/freetype', adapt(scenarioFreetype.POST)); // SSE
app.post('/api/scenarios/sessions/:id/abort', adapt(scenarioAbort.POST));
app.post('/api/scenarios/sessions/:id/pause', adapt(scenarioPause.POST));
app.post('/api/scenarios/sessions/:id/resume', adapt(scenarioResume.POST));
app.post('/api/scenarios/sessions/:id/complete', adapt(scenarioComplete.POST));

// memories
app.get('/api/memories', adapt(memories.GET));
app.get('/api/memories/recent', adapt(memoriesRecent.GET));
app.delete('/api/memories/:id', adapt(memoryById.DELETE));

// journey
app.get('/api/journey/summary', adapt(journeySummary.GET));
app.get('/api/journey/relationships', adapt(journeyRelationships.GET));
app.get('/api/journey/streak', adapt(journeyStreak.GET));

// achievements
app.get('/api/achievements', adapt(achievements.GET));
app.post('/api/achievements/generate', adapt(achievementsGenerate.POST));

// settings
app.get('/api/settings', adapt(settings.GET));
app.put('/api/settings', adapt(settings.PUT));

// system
app.get('/api/system/health', adapt(systemHealth.GET));
app.get('/api/system/models', adapt(systemModels.GET));
app.post('/api/system/reset', adapt(systemReset.POST));

// dev
app.post('/api/dev/memory-eval', adapt(devMemoryEval.POST));

// learner model
app.get('/api/learner-model', adapt(learnerModel.GET));
app.get('/api/scenarios/recommendation', adapt(scenarioRecommendation.GET));
app.post('/api/scenarios/recommendation/dismiss', adapt(scenarioRecommendationDismiss.POST));
app.post('/api/scenarios/templates/:id/start', adapt(scenarioTemplateStart.POST));
