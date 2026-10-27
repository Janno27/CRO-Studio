// Selector uniqueness report for a stored capture (markdown).
import { readCapture } from './store.js';

const ICON = { 'verified-unique': 'OK', 'verified-non-unique': 'WARN', fragile: 'WARN', 'not-found': 'FAIL', 'wrong-element': 'FAIL', invalid: 'FAIL' };

export function selectorReport(dir) {
  const { metadata, targets } = readCapture(dir);
  const L = [`# Selector report: ${metadata.captureId}`, '', `${metadata.url} | market ${metadata.market || 'unknown'} | page ${metadata.pageType} | viewport ${metadata.viewport.width}x${metadata.viewport.height} | ${metadata.capturedAt}`, ''];
  if (!targets.length) return `${L.join('\n')}No targets were requested (survey or page-only capture).\n`;
  L.push('| | Target | Selector | Matches | Class | Why |', '|---|---|---|---|---|---|');
  targets.forEach((t) => {
    const a = t.selectorAssessment || { classification: 'not-found', reasons: [t.error || ''] };
    L.push(`| ${ICON[a.classification] || '?'} | ${t.name} | \`${t.selector}\` | ${t.matchCount} | ${a.classification} | ${(a.reasons || []).join('; ') || (t.dynamicallyRendered ? 'rendered client-side' : '')} |`);
  });
  targets.filter((t) => t.found).forEach((t) => {
    const a = t.selectorAssessment;
    const best = (t.candidates || []).find((c) => c.classification === 'verified-unique');
    L.push('', `## ${t.name}`);
    if (a && a.classification !== 'verified-unique') L.push(best ? `Your selector is ${a.classification}. A unique alternative: \`${best.selector}\`.` : `Your selector is ${a.classification} and no unique alternative was found: ask for a stable hook (data attribute) or scope by an ancestor.`);
    else L.push('Selector is unique and points to the target.');
    L.push('', 'Candidates (best first):', ...(t.candidates || []).map((c) => `- \`${c.selector}\` ${c.classification} (${c.count} match${c.count === 1 ? '' : 'es'})${c.reasons.length ? `: ${c.reasons.join('; ')}` : ''}`));
    if (t.dynamicallyRendered === true) L.push('', 'Absent from the server HTML: rendered client-side. Use `observe: \'persist\'` (or \'when-needed\') and never rely on DOMContentLoaded.');
    if (!t.visible) L.push('', 'The element is not visible at capture time (hidden, zero size or below an interaction).');
  });
  if (metadata.limitations.length) L.push('', '## Limitations', ...metadata.limitations.map((l) => `- ${l}`));
  return `${L.join('\n')}\n`;
}
