# Kickoff — Template Studio

This folder is the starting point for a new project. It contains no code yet, on purpose.

## Setup

1. Open a new Claude Code session with this folder as the working directory:

```bash
cd template-studio   # from the root of the Scugnizzi-Tools repo
```

2. Select **Opus 5** as the model.
3. Turn reasoning up to its highest setting for the session. In Claude Code that is the
   `ultrathink` keyword in your message, which is already included in the prompt below.
4. Start in plan mode so the first reply is a plan rather than code. Shift+Tab cycles into it,
   or start the session with `--permission-mode plan`.
5. Paste the prompt below as the first message.

## The prompt

---

ultrathink

You are starting a new project in this folder. Nothing has been written yet.

Read these four documents completely before you respond. They are the entire brief.

- `docs/brief.md` — what this is, who it is for, what success looks like, what is fixed
- `docs/plan.md` — a detailed proposal for the data model, editor and phases
- `docs/learnings.md` — every fact about HubSpot and email rendering that version one paid
  for, each marked verified, documented or unverified
- `docs/acceptance.md` — how we will decide it is done

Also look at, but do not copy the architecture of:

- `reference/v1-template-builder.html` — the working version one, a single 116KB HTML file
- `reference/v1-export-example.html` — what it exports, the output you have to match or beat
- `reference/v1-standard-email.design.json` — a real saved design, your import fixture
- `reference/v1-readme.md` — how the team uses version one today

How to treat the plan: the behaviors, constraints and email-rendering requirements are
requirements. The technology choices are not. `docs/plan.md` names a stack because someone had
to name one; if you have a better answer, take it, and say why in one paragraph. The same goes
for the file layout, the state model and how drag and drop works. I want your judgment on how
to build this, not an implementation of my guess.

Three things are genuinely fixed. No backend, no login, no accounts. The exported HubSpot
template file is the product and everything else serves it. The marketing team edits fields,
never layout.

Two architectural decisions from version one earned their place and I would keep them unless
you disagree with a reason: one render path that emits either the preview or the HubSpot
template depending on a mode flag, so the canvas is the compiled email and they cannot drift;
and a color registry that collects every color used and generates the dark-mode override layers
from it, so no color can be used without gaining an override. Both are explained in
`docs/learnings.md` sections 3.1 and 2.6.

Before writing code, give me:

1. Your read on the brief. What is underspecified, what you would push back on, what you think
   is the hardest part.
2. The architecture you have chosen, with the reasoning for anything that departs from
   `docs/plan.md`.
3. The exact list of HubSpot questions you need answered by a real test send before you can
   build the compiler correctly, as one checklist I can run in an afternoon. Section 1.6 of the
   learnings document is the big one. Assume I can upload a throwaway template, create an email,
   fill in fields, send it to myself and screenshot both the editor and the result.
4. A build order, with what is usable at the end of each step. Something I can actually run
   should exist early.

Then stop and let me respond before you build.

One working practice for the whole project: keep `docs/learnings.md` current. When a real send
answers an open question, upgrade that item from unverified to verified with the date. When you
discover something new about how a client renders, add it. That file is the asset that survives
this project.

---

## What to hand over after the first reply

Answer the HubSpot checklist first. Everything else waits on it, and it is the only part only
you can do.
