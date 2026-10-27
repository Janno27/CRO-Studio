# LinkedIn post drafts (edit freely)

## English

Most A/B test bugs are not strategy bugs. They are code bugs: a variation that injects twice after a re-render, CSS that leaks into the rest of the page, an event that fires with the wrong name.

I built a tool to stop shipping those, and I'm open-sourcing it today: **CRO Studio** (MIT).

What it does:
→ You describe the test (typed in Claude, or pulled from your tool through MCP). Missing details come as batches of questions, nothing is invented.
→ It scaffolds the variation on a small runtime that is idempotent, scoped, observer-safe and fully removable.
→ `validate` + `build` check the code, then actually run the built payload in jsdom: double injection, missing targets, destroy restores the page.
→ Output is plain JS/CSS for any testing platform.
→ Everything is configurable: markets and hosts, namespace, tracking shape (dataLayer template or your own hook), Figma/Storybook, optional design and engineer review gates, for teams that have them and teams that don't.

What it will never claim: that a green build means it works on your platform. The human preview and the platform check stay yours.

Node 20.19+, macOS/Linux/Windows. `npx cro-studio init` and you're set.

Repo: https://github.com/Janno27/CRO-Studio
npm: https://www.npmjs.com/package/cro-studio
Feedback, issues and PRs welcome, especially platform wrappers and brief adapters.

#CRO #ExperimentationAB #ABTesting #OpenSource #Claude

## Français

La plupart des bugs d'A/B test ne sont pas des erreurs de stratégie, ce sont des bugs de code : une variation injectée deux fois après un re-render, du CSS qui déborde, un event qui part avec le mauvais nom.

J'ai construit un outil pour arrêter de livrer ça, et je le passe en open source : **CRO Studio** (MIT).

→ Tu décris le test (dans Claude, ou récupéré depuis ton outil via MCP). Ce qui manque est demandé par lots de questions, rien n'est inventé.
→ La variation repose sur un runtime idempotent, scopé et entièrement réversible.
→ `validate` + `build` analysent le code puis exécutent réellement le payload dans jsdom : double injection, cible absente, destroy qui restaure la page.
→ Sortie JS/CSS pour n'importe quelle plateforme de test.
→ Tout se configure : marchés, namespace, format de tracking (template dataLayer ou ton propre hook), Figma/Storybook, revues Design/Dev optionnelles.

Ce qu'il ne prétend jamais : qu'un build vert garantit que ça marche sur ta plateforme. La preview humaine et la vérification plateforme restent à toi.

Pour essayer : `npx cro-studio init` (Node 20.19+, macOS/Linux/Windows)

Repo : https://github.com/Janno27/CRO-Studio
npm : https://www.npmjs.com/package/cro-studio
