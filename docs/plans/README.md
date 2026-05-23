# Plans

Plans are checked-in execution notes for work that spans multiple changes or
needs durable context across agent runs. Keep small, single-turn changes in the
conversation instead of creating a plan file.

Use plans for:

- Cross-cutting migrations.
- Multi-phase performance, reliability, or data-model work.
- Work with decisions that future agents need to preserve.
- Tasks that are paused and resumed across branches or sessions.

## Structure

- `active/`: plans that describe current or paused work.
- `completed/`: plans that are finished and kept for history.

## Template

```md
# Plan Title

## Context

What prompted the work, what exists today, and links to the source-of-truth docs
or investigations.

## Goals

- Concrete outcomes the work must achieve.

## Non-Goals

- Boundaries that keep the work scoped.

## Phases

### Phase 1: Name

- Task or checkpoint.

Exit criteria:

- Observable condition that proves the phase is complete.

## Progress Log

- YYYY-MM-DD: Notable status update.

## Decision Log

- YYYY-MM-DD: Decision and reason.

## Validation

- Commands, checks, production probes, or manual QA required before handoff.
```
