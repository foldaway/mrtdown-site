# Outcome to deliver

Maintain this living plan according to `docs/plans/README.md`.
Replace these prompts with task-specific facts; keep each section concise.

## Purpose

State what someone will be able to do and how they can tell it works. Name
scope limits that affect the decision or implementation.

## Progress

- [ ] Name the next verifiable step and its blocker, if any.

Date completed items and link to the change or verification result. At each
handoff, split partial work into completed and remaining steps. Distinguish
implemented code, local verification, and observed deployment.

## Surprises & Discoveries

Record discoveries that change the work. Give the observation and a short
piece of evidence or a link. Use “None recorded” until there is a finding.

## Decision Log

Record the date, decision maker, choice, and reason. Link any approval or
evidence the choice depends on. Use “None recorded” until there is a decision.

## Outcomes & Retrospective

At a milestone or at closeout, compare the observed result with the purpose.
Link the verification, remaining work, and any operating guidance that changed.
Record deferred work with its owner document or issue before closing the plan.

## Context and Orientation

Give a reader with a fresh checkout the context to resume. Name the current
behavior, repository-relative paths, dependencies, and assumptions that affect
the work. Explain unfamiliar terms and summarize decisions from outside the repo.
Link to the schemas, tests, and guides that own the details. Include essential
external decisions here; a chat reference or external link alone is insufficient.
Identify historical observations by date and say what still needs rechecking.

## Plan of Work

Order milestones by dependency. Explain the change, owning paths, and observable
result of each. Use a small experiment first when a design assumption is unproven.
Keep milestone intent here and exact invocations in Concrete Steps.

## Concrete Steps

Give commands in execution order, their working directory, prerequisites, and
expected output. State which steps write files or use paid/external services.
Label commands that depend on unfinished implementation; do not invent an API.

## Validation and Acceptance

Describe a concrete scenario and the result a reader should observe. Give the
expected output and refer to Concrete Steps for commands. Link actual results as work
lands. For internal changes, name the regression or invariant that proves the
intended behavior.

## Idempotence and Recovery

Explain what happens on a repeat or partial failure. Give safe retry, cleanup,
and rollback steps, including any state that must be retained. If no mutation
is planned, say why recovery is unnecessary.

## Artifacts and Notes

Link the small receipts, diffs, or test results that prove the outcome. Record
exact identities when they matter. Keep large reports outside the plan and
distinguish expected evidence from evidence already obtained.

## Interfaces and Dependencies

Name the affected contracts, owning modules, and external dependencies. Specify
new or changed boundaries and compatibility needs; link to existing schemas
instead of duplicating field lists. Record unresolved contracts as decisions
to settle before dependent implementation.
