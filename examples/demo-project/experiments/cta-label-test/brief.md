---
id: cta-label-test
ref: "DEMO-2"   # your tracker reference (optional unless the experiment tracks events)
name: "Clearer add-to-cart label"
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
# Clearer add-to-cart label

Write `Unknown` instead of inventing content.

## Hypothesis
A label that states the delivery promise ("ships tomorrow") removes uncertainty and increases add-to-cart clicks.

## Context
Synthetic demo experiment shipped with CRO Studio. Shows a text change that is fully reverted on destroy().

## Control
Original add-to-cart label.

## Variation
Label becomes "Add to basket, ships tomorrow"; the original text is stored in a data attribute and restored on destroy().

## Success criteria
Primary KPI: add-to-cart click-through rate.

## Design
Unknown

## Tracking
`cta_clicked` on every click of the button.

## Technical risks
Unknown

## Open questions
- (none)
