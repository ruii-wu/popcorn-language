// src/server/scenario/role.ts
interface NpcLike { scenarioRoles: string }
interface TemplateLike { rolePlayedBy: string }

export interface ResolvedRole { roleName: string; defaultStress: 'Low' | 'Medium' | 'High' }

// Finds the NPC's roleplay role for a template; falls back gracefully if seed data is sparse.
export function resolveRole(npc: NpcLike, template: TemplateLike): ResolvedRole {
  const roles = JSON.parse(npc.scenarioRoles) as { id: string; name: string; defaultStress: string }[];
  const role = roles.find((r) => r.id === template.rolePlayedBy);
  const stress = role?.defaultStress;
  return {
    roleName: role?.name ?? template.rolePlayedBy,
    defaultStress: stress === 'Low' || stress === 'High' ? stress : 'Medium',
  };
}
