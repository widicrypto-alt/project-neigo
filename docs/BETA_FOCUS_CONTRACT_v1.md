> ✅ **STATUS (apr 2026): ACTIVE CONTRACT.** A/B/C/D/F/G fully enforced. B updated: ROLEPLAY only (CHAT parked). E widened — /stories, /letters, /creators, /studio all live. Contract text is authoritative; any relaxation must update this file.

---

# Beta Focus Contract v1

Status: Locked for Beta
Effective Date: 2026-04-18
Owner: Product + Engineering
Applies To: packages/shared, packages/server, packages/web

## 1) Purpose

This document is the single execution contract for beta scope.
If any existing strategy/plan note conflicts with this contract, this contract wins for beta execution.

## 2) Source Priority

1. This document (BETA_FOCUS_CONTRACT_v1.md)
2. PRESENCE_CONTRACT_v1.md (visual-presence implementation contract)
3. BRAINSTORM.md (v7 direction, where non-conflicting)
4. BETA_LAUNCH.md (advisory ideas only when non-conflicting)
5. PLAN.md (engineering backlog and architecture reference)

## 3) Product Promise

A companion experience that remembers, pushes back in-character, and continues naturally between sessions.

## 4) Final Decisions By Area

### A. Model

Decision:
- Single voice architecture for beta.
- Model family exposed to users as Crescent only.
- No model picker in beta UI.
- No session-level model switching UX in beta.

Policy:
- Backend may keep internal model slug fields for compatibility, but user-facing product behavior is single-voice.
- Any future multi-model experiment is post-beta and must be feature-flagged.

Acceptance criteria:
- User cannot choose model in current beta flows.
- Session creation defaults to one model path.
- User-facing copy never markets multiple model tiers during beta.

### B. Mode

Decision:
- Public interaction mode: **ROLEPLAY only.**
- `BETA_CHAT_MODES = ['ROLEPLAY']` in `@neigo/shared` — this is the implemented and enforced state.
- CHAT, HAREM, LEARNING, DEBATE, IMMERSION are not public product surfaces.

Policy:
- Non-public modes may remain in backend scaffolding for future use but must not appear in navigation, onboarding, or user-facing copy.
- Any reactivation requires explicit re-decision and contract revision.

Acceptance criteria:
- New session flow creates ROLEPLAY sessions only.
- Sidebar/top-level navigation has no entry for non-ROLEPLAY modes.
- Public copy never mentions mode variety — only the story/character experience.

### C. NSFW / Content

Decision:
- NSFW toggle and age-gate UI are **removed** from all user-facing surfaces.
- The model always runs fully uncensored server-side — no user toggle, no flag, no label.
- The explicit-content directive is always injected into every prompt automatically.

Policy:
- Hard limits remain enforced at the prompt level regardless (minors, non-consensual framed as desirable, real identifiable people, bestiality).
- No "mature mode" language anywhere in UI, marketing, or onboarding.
- Backend `nsfwEnabled` DB column and `/api/auth/nsfw` route may remain dormant — they are not called by the client.

Acceptance criteria:
- Settings page contains no NSFW toggle, age gate modal, or related labels.
- `appendNsfwDirective` always emits the full uncensored block, ignoring any param.
- `orchestrator.ts` always passes `nsfwEnabled: true` to prompt builder.
- `MeResponse` on the frontend does not include `nsfwEnabled` / `ageConfirmed`.

### D. Tier

Decision:
- Beta tiering stays operationally simple and quota-first.
- Quotas are enforced server-side using fixed-window controls.
- Enterprise is not part of beta go-to-market messaging.

Policy:
- Tier internals may include additional enum values for compatibility, but beta UI/copy should avoid enterprise sales framing.
- Beta conversion uses gentle continuity messaging, not hard scene interruption.

Acceptance criteria:
- Session/turn caps enforced via middleware.
- User receives clear, user-facing budget/limit responses.
- Beta settings show practical quota limits and feature flags, not enterprise packaging copy.

### E. UI Exposure

Decision:
- Public beta UI is intentionally narrow.
- Primary surfaces: Discover, Chats, Settings.
- Character management remains available for functionality, but no broad feature-sprawl messaging.

Policy:
- Keep first-session path strong: scene open, optional silence, nudge, return continuity.
- Keep stats abstraction strong: relationship stage visible, avoid noisy raw stat overload in core chat UX.

Acceptance criteria:
- Chat opening flow supports open, nudge, return behavior.
- Relationship stage is visible and readable in core chat header/state.
- Non-beta experiments are hidden behind flags or omitted from primary navigation.

### F. Monetization

Decision:
- Monetization for this beta phase is soft-pressure and retention-first.
- No full Stripe checkout dependency is required to define beta success.

Policy:
- Allowed in beta: quota gating, upgrade moments after vulnerable/emotional milestones, non-intrusive prompts.
- Deferred post-beta: full billing stack polish (checkout/webhooks/customer lifecycle), broad packaging experiments.

Acceptance criteria:
- Core beta can run and be evaluated without blocking on full payments integration.
- Upgrade prompts do not interrupt active emotional scene moments.
- Monetization messaging maps to continuity value, not feature spam.

### G. Presence Runtime (Visual Feedback)

Decision:
- Presence runtime for beta is visual-only.
- TTS is disabled/not required in beta operation.
- Real-time feedback must focus on activity states: thinking, typing, speaking, success, error, idle.

Policy:
- Presence behavior must follow PRESENCE_CONTRACT_v1.md.
- No feature dependency on voice pipeline for core chat UX.
- Any future TTS reactivation is post-beta and feature-flagged.

Acceptance criteria:
- Core chat experience remains fully functional with TTS disabled.
- Visual presence transitions remain deterministic and anti-flicker.
- Presence signals align with stream lifecycle and retry/error flows.

## 5) What Is Explicitly Out Of Scope For Public Beta

- Public multi-model positioning.
- Feature-first mode expansion narrative.
- Enterprise GTM narrative.
- Payment-stack completeness as launch blocker.

## 6) Operational Guardrails

- Keep one canonical launch narrative across docs, UI text, and team communication.
- Any scope increase must include explicit tradeoff and owner.
- Any behavior change that impacts first-session quality, memory continuity, or refusal quality requires re-audit.

## 7) Revision Rules

- Contract updates require:
  1. Date
  2. Owner
  3. Changed section
  4. Reason
  5. Rollout impact

Append revisions below this section.

## 8) Revision Log

- 2026-04-18: v1 created as single-source beta contract to resolve conflicts across BETA_LAUNCH.md, BRAINSTORM.md, and PLAN.md.
- 2026-04-18: Public-beta hardening applied: sidebar narrowed to Discover/Chats/Settings, settings learner exposure removed, session create restricted to CHAT/ROLEPLAY, learner routes gated behind `ENABLE_LEARNER_ROUTES` (default off).
- 2026-04-18: Section C revised — NSFW toggle removed from all UI surfaces; model runs fully uncensored server-side always (orchestrator `nsfwEnabled: true`, `appendNsfwDirective` always emits full block). Hard limits retained at prompt level.
- 2026-04-18: NSFW backend toggle endpoint disabled (`PATCH /api/auth/nsfw` returns `not_available_in_beta` 404) to align server behavior with Section C.
- 2026-04-18: Source priority updated to include PRESENCE_CONTRACT_v1.md; Section G added to lock visual-only presence runtime (no TTS dependency).
- 2026-04-23: Section B revised — "CHAT and ROLEPLAY" corrected to "ROLEPLAY only." `BETA_CHAT_MODES = ['ROLEPLAY']` is the implemented reality. CHAT mode parked; HAREM/LEARNING/DEBATE/IMMERSION backend scaffolding retained but not exposed. Re-decision required to surface any of them.
