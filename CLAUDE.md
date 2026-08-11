## i18n

Tutte le stringhe visibili all'utente nel frontend vanno SEMPRE tradotte in tutte le lingue supportate (italiano e inglese). Mai hardcodare testo UI nei componenti:
- Usa `t("...")` di react-i18next e aggiungi le chiavi sia in `frontend/public/locales/it/platform.json` che in `frontend/public/locales/en/platform.json`.
- Vale anche per messaggi di validazione, toast/notifiche, banner, placeholder, aria-label e testi di errore.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- When committing a graph refresh, stage the graph explicitly: `git add graphify-out backend/graphify-out`. Never `git add -A` or `git add .` for it. More than one session can be working in this tree at the same time and they share one index, so a broad add sweeps whatever someone else has staged into a commit titled "chore: refresh the knowledge graph". It has already buried a source file deletion that way.
- Before committing anything, check `git diff --cached --name-status` and commit only the paths you touched. `git status` showing changes you do not recognise means another session is working here, not that the tree is dirty.
