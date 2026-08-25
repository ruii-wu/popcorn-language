-- Learning-update snapshots for the scenario end flow.
-- Pre = target-skill levels immediately before scenario_summary signals write.
-- Post = same skills after that write. Delta powers the summary "Learning Update" block.
ALTER TABLE "ScenarioSummary" ADD COLUMN "preLevels"  TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ScenarioSummary" ADD COLUMN "postLevels" TEXT NOT NULL DEFAULT '{}';
