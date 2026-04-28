# ADR-NNN: <decision title>

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | ✅ Implemented | Superseded by ADR-XXX | Deprecated

## Context

What is the issue or trigger that motivates this decision?
What forces are at play (technical, organizational, project-level)?
What is the current baseline — pain points, prior incidents, eval scores
to preserve?

## Decision

What is the change being made?

For multi-step decisions: structure as numbered phases (`### Phase N — ...`)
with their own change footprint, code snippets, verification, and rollback.
Locality matters — keep verification + rollback inline with each phase.

Include exact param values, file paths, model IDs, code excerpts —
anything a future reader needs to apply or revisit the decision.

## Consequences

### Per-phase verification gates

A summary table of what must pass at each phase boundary:

| Gate | Criterion | If fail |
|---|---|---|
| After P1 | ... | Rollback P1 |
| ... | ... | ... |

### Trade-offs (Non-goals — deliberately not done)

- **<thing>** — <why we said no>
- **<thing>** — <why we said no>

If a non-goal gets reversed during implementation, annotate it inline:
~~Original wording~~ → **Reversed during Phase X:** new direction + reason.

## References

- **Source code:** file paths + function names anchoring this decision in the
  current codebase (use relative links from this file when possible)
- **Failure traces / metrics:** prod execution IDs, eval scores, dashboard links
- **External references:** papers, blog posts, prior ADRs (`ADR-NNN`)
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
