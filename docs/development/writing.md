# Writing docs and proposals

Write for a busy reader. Put the proposed change, its reason, and any decision
needed in the first few lines. Give a reader enough context to review it
without the original conversation.

- Use descriptive headings, short paragraphs, and bullets for distinct points.
  Number steps that must happen in order.
- Keep each fact in one place. Link to the owning guide, schema, test, or
  workflow for details a reader can look up. Skip directory inventories,
  field lists, and code walkthroughs that merely restate the source.
- Keep the details someone needs to act. Record the intended behavior, why
  it matters, tradeoffs that affect the decision, and any operational step
  that requires judgment or access outside the repo.
- In a proposal, distinguish observed facts from assumptions. Say how to
  verify the outcome and how to recover from a failed rollout when relevant.
  Put resumable work in an [execution plan](../plans/README.md).
