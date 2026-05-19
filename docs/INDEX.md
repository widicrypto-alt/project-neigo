# Docs Index — Status Map (apr 2026)

> Last audit: apr 23 2026. Migration head: `0054_queued_for_publish.sql`. Services live (server:4000, web:3000).
>
> Legend: ✅ fully shipped · 🟡 partial · ❌ pending · 🔴 obsolete
>
> 📌 **Only [BACKLOG.md](BACKLOG.md) contains live TODOs.** Every other doc is either a locked contract, an execution log, or a brainstorm archive with checkmarks.

## Live backlog

| Doc | Role |
|---|---|
| [BACKLOG.md](BACKLOG.md) | **SINGLE SOURCE OF TRUTH** for remaining actionable items |

## Locked contracts (do not rewrite, add banners only)

| Doc | Why kept |
|---|---|
| [PLAN.md](PLAN.md) | Architectural reference — tech stack & migration order |
| [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md) | Governing beta posture (single voice, no TTS, narrow UI baseline) |
| [PRESENCE_CONTRACT_v1.md](PRESENCE_CONTRACT_v1.md) | Presence state-machine contract (implemented) |
| [PLANDESIGNv1.md](PLANDESIGNv1.md) | Cross-surface design contract (VN scope-lock, mobile-first, EN-first) |
| [PLANVNv1.md](PLANVNv1.md) | VN design reference — §A–§E normative (system goals, relevance filter, deep brainstorm, add/remove, gaps) |
| [PLANVNv2.md](PLANVNv2.md) | VN kinetic **build plan** — 8 steps, 0 new migrations, 0 new components; supersedes PLANVNv1 §F + BV1–BV13. **All 8 steps shipped (apr 2026).** |

## Execution logs (historical — completed work, annotated)

| Doc | Scope |
|---|---|
| [PLANv2.md](PLANv2.md) | Wk 1–14 Marinara migration — all shipped |
| [MARINARA_AUDIT.md](MARINARA_AUDIT.md) | Clean-room provenance trail (AGPL §13) |
| [BRAINSTORM.md](BRAINSTORM.md) | v7 decision log |
| [BETA_LAUNCH.md](BETA_LAUNCH.md) | Beta north-star narrative |
| [REDESIGNv2.md](REDESIGNv2.md) | D1–D5 shipped, D6 partial, Tahap C pending |
| [FRONTEND.md](FRONTEND.md) | ID-first mobile principles (still governing) |
| [PLAN_IMPLEMENTSv1.md](PLAN_IMPLEMENTSv1.md) | Day 1–3 — ✅ |
| [PLAN_IMPLEMENTSv2.md](PLAN_IMPLEMENTSv2.md) | Day 4–8 — mostly ✅, Day 5 `{{button}}` → BACKLOG |
| [PLAN_IMPLEMENTSv3.md](PLAN_IMPLEMENTSv3.md) | Day 9–11 — ✅ except agent-pipeline live wire → BACKLOG |
| [PLAN_IMPLEMENTSv4.md](PLAN_IMPLEMENTSv4.md) | Day 12–14 — mixed; live items → BACKLOG |
| [PLAN_IMPLEMENTSv5.md](PLAN_IMPLEMENTSv5.md) | Tracks A/B/C — mixed; live items → BACKLOG |
| [PLANIMPv4.md](PLANIMPv4.md) | Story studio — shipped, optional extractions deferred |
| [PLANIMPv5.md](PLANIMPv5.md) | Character studio parity — shipped |
| [PLANIMPv6.md](PLANIMPv6.md) | Rich content — shipped, minor polish → BACKLOG |
| [PLANIMPv7.md](PLANIMPv7.md) | Default-public + moderation — mostly shipped, polish → BACKLOG |
| [PLANIMPv8.md](PLANIMPv8.md) | Rollout plan — Phases A–G done, Phase H → BACKLOG |
| [PLANBv2.md](PLANBv2.md) | Storylines — schema shipped; dedicated cinema route deferred → BACKLOG |
| [PLANBv5.md](PLANBv5.md) | Home-rail redesign D2 — mostly shipped |
| [PLANBv7.md](PLANBv7.md) | Hardening work-orders — W-A..W-J all ✅ including W-E (story cinema chrome, B1.1) |

## Active remediation plans

| Doc | Role |
|---|---|
| [PLANSTUDIOv1.md](PLANSTUDIOv1.md) | ✅ Studio remediation — S1/S2/S3/S4/S5 all shipped (2026-04-25) |

## PLANCHATv3 phase plans (apr 2026)

| Doc | Role |
|---|---|
| [Phase1Audit.md](Phase1Audit.md) | ✅ Phase 1 audit — TrustBar shipped, MoodTimeline deferred |
| [TaskCompletedv1.md](TaskCompletedv1.md) | ✅ Phase 1 implementation report |
| [Phase2Plan.md](Phase2Plan.md) | ✅ CAST mode — COMPLETE (harem→cast rename done 2026-04-25) |
| [Phase3Plan.md](Phase3Plan.md) | ✅ VN mode — production ready, settings pending |
| [Phase4Plan.md](Phase4Plan.md) | ✅ Arc & Background — complete, all bugs fixed 2026-04-25 |
| [Phase4Audit.md](Phase4Audit.md) | ✅ Phase 4 audit — bugs fixed; dead code CAST block + summary quality noted as deferred |
| [Phase5Plan.md](Phase5Plan.md) | 🟡 Content Rating + Model Selection — all done except mana-estimate display (deferred) |

## Deleted (fully shipped; content captured in code + repo memory)

- ~~PLANIMPv1.md~~ — foundations & primitives all shipped (migrations 0042–0046)
- ~~PLANIMPv2.md~~ — character detail migrations + page + components shipped
- ~~PLANIMPv3.md~~ — story detail migrations + page + components shipped
- ~~PLANBv1.md~~ — real tokenizer shipped (`tokenizer.ts`)
- ~~PLANBv3.md~~ — character galleries + variants + RLS shipped
- ~~PLANBv4.md~~ — memory-graph writer+reader+prompt slot shipped
- ~~PLANBv6.md~~ — lineage emit sites, backfill, GC shipped
- ~~CLEANROOM_NOTES.md~~ — superseded by [PLANv2.md](PLANv2.md) §11 + [MARINARA_AUDIT.md](MARINARA_AUDIT.md)
