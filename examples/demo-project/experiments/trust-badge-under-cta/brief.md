---
id: trust-badge-under-cta
ref: "DEMO-1"   # your tracker reference (optional unless the experiment tracks events)
name: "Trust badge under the add-to-cart button"
status: draft       # draft | ready
owner: null
markets: [main]
pageTypes: [product]
urls: []            # [{ market, label, url }]
design:
  figma: null       # Figma link (file or frame) for the variation
tracking:
  required: unknown # true | false | unknown
  events: []        # [{ label: snake_case, trigger: visible|click|immediate|custom, target: selector name }]
reviews:            # pending | approved | skipped ; enforced for status "ready" when enabled in cro-studio.config.json
  design: skipped
  engineer: skipped
---
# Trust badge under the add-to-cart button

Write `Unknown` instead of inventing content.

## Hypothesis
If we show "30-day free returns" right under the add-to-cart button, hesitant visitors feel safer, so add-to-cart rate on product pages increases.

## Context
Synthetic demo experiment shipped with CRO Studio. The selector is a placeholder: replace it with one verified on your own page.

## Control
Product page without any reassurance message near the button.

## Variation
A green "30-day free returns" line is inserted after the button. It is inserted once, survives framework re-renders and is removed by destroy().

## Success criteria
Primary KPI: add-to-cart rate. Guardrail: no change in checkout error rate.

## Design
Unknown

## Tracking
`returns_badge_seen` is sent once when 50% of the badge is visible.

## Technical risks
Unknown

## Open questions
- (none)
