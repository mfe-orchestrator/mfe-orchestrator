## i18n

Tutte le stringhe visibili all'utente nel frontend vanno SEMPRE tradotte in tutte le lingue supportate (italiano e inglese). Mai hardcodare testo UI nei componenti:
- Usa `t("...")` di react-i18next e aggiungi le chiavi sia in `frontend/public/locales/it/platform.json` che in `frontend/public/locales/en/platform.json`.
- Vale anche per messaggi di validazione, toast/notifiche, banner, placeholder, aria-label e testi di errore.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- Use `graphify query "<question>"` when the question is about architecture, ownership, or how files relate — cases where it can replace several greps with one step. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- Do **not** run a graphify query before a grep or read you already know the target of. Measured on a week of sessions in this repo: a tool round-trip costs about the same regardless of how small its output is (~$0.14 either way, because the price is re-reading the whole context, not the tool output). An orientation step that does not remove a later grep is pure added cost, and 81% of graphify queries here were followed by a raw grep or read anyway.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context. It is ~11k tokens — do not load it to answer a narrow question.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- When committing a graph refresh, stage the graph explicitly: `git add graphify-out backend/graphify-out`. Never `git add -A` or `git add .` for it. More than one session can be working in this tree at the same time and they share one index, so a broad add sweeps whatever someone else has staged into a commit titled "chore: refresh the knowledge graph". It has already buried a source file deletion that way.
- Before committing anything, check `git diff --cached --name-status` and commit only the paths you touched. `git status` showing changes you do not recognise means another session is working here, not that the tree is dirty.

## Costo di contesto

Measured over 43 sessions in this repo (5–11 Aug 2026): the dominant cost is the *number of tool round-trips*, not the size of what each one returns. One assistant step averaged $0.22, and each step re-reads the entire accumulated context. What follows from that:

- **Batch independent shell work into a single Bash call.** 725 separate `cat`/`head`/`tail`/`sed` calls accounted for ~$100 of the week. Chain them with `&&` or `;` when they don't depend on each other's output.
- **One `Read` beats three `head`/`sed` calls on the same file.** Reading a file in slices costs a round-trip per slice; the slices themselves are nearly free by comparison.
- **Run independent tool calls in the same message** so they execute in parallel rather than as separate steps.
- **Keep sessions scoped.** The two most expensive sessions ran at 265k and 291k tokens of average context; at that size every single step costs ~$0.15 in context re-reads alone before doing any work. Prefer a fresh session over continuing an unrelated task in a large one.
