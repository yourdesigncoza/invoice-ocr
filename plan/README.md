# Plan Directory

File-driven planning framework for WeCoza Core. Plans live here as structured markdown — each phase reads the previous phase's output.

## Structure

```
plan/
├── README.md           ← this file
├── active/             ← plans in progress
│   └── {date}-{slug}/
│       ├── brief.md        ← Phase 1: clarified requirement
│       ├── plan.md         ← Phase 2: decomposed plan with affected scope
│       ├── sections/       ← Phase 3: self-contained step files
│       │   ├── step-01-{step-slug}.md
│       │   ├── step-02-{step-slug}.md
│       │   └── ...
│       ├── review.md       ← Phase 4: Gemini review findings
│       └── progress.md     ← Phase 5: execution tracking (includes git hash)
├── archived/           ← abandoned plans (RETHINK / won't-do)
└── completed/          ← finished plans
```

## Workflow

| Command | Phase | Model | Does |
|---------|-------|-------|------|
| `/ydcoza-plan brief <instruction>` | 1 | Opus | Evaluate, clarify, write brief.md |
| `/ydcoza-plan build [slug]` | 2+3 | Opus | Context, decompose, write plan.md + sections/ |
| `/ydcoza-plan review [slug]` | 4 | Gemini | Review, revise (Bucket A auto / Bucket B ask), write review.md |
| `/ydcoza-plan execute [slug]` | 5 | Sonnet | Implement next ready step, update progress.md |
| `/ydcoza-plan status [slug]` | — | Any | Show progress across plans |
| `/ydcoza-plan rebuild [slug]` | 2+3 | Opus | Keep brief.md, discard plan + sections, rebuild |
| `/ydcoza-plan archive [slug]` | — | Any | Move to plan/archived/ |

## Context Sources

Plans are built using three context layers:
- **DevVault** — module notes + ADRs (`/home/laudes/zoot/DevVault/wecoza-core/`)
- **Graphify** — code knowledge graph (`graphify-out/graph.json`)
- **Schema** — PostgreSQL DDL reference (`schema/SCHEMA-GRAPH.md`)
