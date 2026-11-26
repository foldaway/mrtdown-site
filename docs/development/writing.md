# Writing and maintaining documentation

Update the owning guide in the same PR when behavior changes how someone uses,
operates, or maintains the site. Record decisions whose reasons cannot be read
from code. Use the PR description for a bounded fix or refactor; a separate doc
is useful only when a future reader has a recurring task or durable decision.

## Choose the home

| Reader need | Maintained home |
| --- | --- |
| Set up and run locally | [Repository README](../../README.md) |
| Understand ownership and data flow | `docs/architecture/` |
| Call a public interface | `docs/api/` |
| Configure, verify, or recover a deployment | `docs/operations/` |
| Contribute, check, or regenerate files | `docs/development/` |
| Resume coordinated work | [Active execution plans](../plans/README.md) |
| Consider optional work | [Tech debt](../plans/tech-debt.md) or a linked issue |
| Inspect a dated finding or delivery receipt | `docs/investigations/`, `docs/history/`, or `docs/plans/completed/` |

Extend an existing guide before creating one. Add a new guide for a distinct
reader task and link it from the [documentation index](../README.md), or its
nearest subject index. Add an index only when readers need help choosing between
several documents. Keep `AGENTS.md` a small map to these homes.

Keep operating procedures in guides and work status in plans. Use a PR checklist
for bounded work with a clear implementation and verification path. Use a
versioned plan for ordered work across PRs/repositories, a migration or cutover
with recovery gates, or decisions and blockers that must survive a handoff.
Follow the [planning standard](../plans/README.md) rather than opening a parallel
plan for the same outcome.

## Write for a busy reader

Lead with the concrete behavior or decision, why it matters, and any choice the
reader must make. Use plain language, short paragraphs, and descriptive headings.
Use lists for distinct points, numbered steps for procedures, and tables for
comparisons. Define terms only when the reader needs them to act.

Give each fact one maintained home. Link to owning code, schema, tests and
workflows instead of repeating field lists, directory inventories or code
walkthroughs. Keep technical details that affect a decision, operation, recovery
or verification. Preserve execution-critical assumptions, unresolved questions,
acceptance criteria and evidence when shortening a plan.

Distinguish observed facts, assumptions, proposals and remaining work. Name the
environment and date of observations. A merged implementation, a local passing
test and a verified production rollout establish different things. Summarize
required external context in the repository; a chat pointer alone cannot support
a handoff.

## PR descriptions

Use a concise, feature-oriented Conventional Commit title. Lead the body with
the problem and resulting behavior. A small PR usually needs one or two sentences
or a few bullets plus validation and any material limitation. Describe the final
change for a reviewer without the conversation; rewrite the title and body if
scope changes. Link durable guides and evidence instead of pasting them.

## Keep docs current

When changing a subject, compare its guide and active plan with the owning source.
Consolidate repeated guidance, correct stale claims, and update inbound links
and tool paths when moving files. After acceptance, transfer lasting operation
instructions to their guide, record exact verification in the plan, move it to
completed, and update the index. Put optional follow-ups in tech debt or issues
rather than keeping a delivered project open indefinitely.

Completed plans and investigations are dated evidence, not operating authority.
Preserve exact review/deployment identities and their uncertainty. Link to an
immutable Git revision for detailed superseded history when useful. Do not
rewrite an old observation as a current fact.

Run `npm run check:docs` for repository links, Markdown heading anchors, plan
index coverage and active-plan layout, then `npm run verify`. These checks expose
structural drift; source review must still establish meaning and freshness.
