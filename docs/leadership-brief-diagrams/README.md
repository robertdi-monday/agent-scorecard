# Leadership brief — diagram sources

PNG exports are generated from these `.mmd` files using:

```bash
cd docs/leadership-brief-diagrams
# Optional: larger canvas for dense flowcharts (default is often too small)
OPTS="-b transparent -w 2400 -H 1800"
npx --yes @mermaid-js/mermaid-cli@11 -i architecture.mmd -o architecture.png $OPTS
npx --yes @mermaid-js/mermaid-cli@11 -i flow-a-embedded-app.mmd -o flow-a-embedded-app.png $OPTS
npx --yes @mermaid-js/mermaid-cli@11 -i flow-b-cli-ci.mmd -o flow-b-cli-ci.png $OPTS
npx --yes @mermaid-js/mermaid-cli@11 -i flow-c-scorecard-agent.mmd -o flow-c-scorecard-agent.png $OPTS
```

Or render all `.mmd` at once:

```bash
for f in *.mmd; do
  npx --yes @mermaid-js/mermaid-cli@11 -i "$f" -o "${f%.mmd}.png" -b transparent -w 2400 -H 1800
done
```

Parent brief: [`../LEADERSHIP_BRIEF_MONDAY_DOC.md`](../LEADERSHIP_BRIEF_MONDAY_DOC.md).

Flow D in the brief is text-only (no diagram).
