# Tracking

The event shape is yours. It is set in `tracking` and compiled into every payload.

## Template mode (default)

```json
"tracking": { "mode": "datalayer", "dataLayer": "dataLayer",
  "template": { "event": "ab_test", "experiment": "{ref}", "variant_event": "{label}", "section": "{section}" } }
```

Placeholders usable in any string value, at any depth: `{id}`, `{ref}`, `{label}`, `{section}` (= `"<ref> - <label>"`). Labels are `snake_case`. The dataLayer is created if missing.

## Hook mode (any analytics tool)

```json
"tracking": { "mode": "hook", "hook": "window.analytics.track" }
```

Your function is called with `{ id, ref, label, section }`. If it does not exist yet, nothing is sent and nothing throws.

## `none`

Tracking calls are no-ops.

## In a variation

```js
ctx.track('label');                         // once per page and label (pass { once: false } to repeat)
ctx.trackWhenVisible(el | selector | fn, 'label', { ratio: 0.5 });
ctx.trackOnClick('.selector', 'label');
```

They need `ref` in `defineExperiment` (checked against the brief). Tracking never throws into the page.
