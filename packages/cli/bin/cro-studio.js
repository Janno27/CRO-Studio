#!/usr/bin/env node
import { runInit } from '../src/commands/init.js';
import { runNew } from '../src/commands/new.js';
import { runValidate } from '../src/commands/validate.js';
import { runBuild } from '../src/commands/build.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runCapture } from '../src/commands/capture.js';
import { runPreview } from '../src/commands/preview.js';
import { parseArgs } from '../src/args.js';

const HELP = `cro-studio <command>

  init                         guided setup: writes cro-studio.config.json (--yes for defaults)
  new <id> [--ref R] [--name N] [--market m] [--page p]
                               scaffold experiments/<id>/
  validate [id]                static checks on one or all experiments
  build [id] [--minify]        validate + bundle into dist/<id>/ (payload.js, variant.js, styles.css, manifest.json)
  preview <id> --url <page> [--headed] [--screenshot file]
                               inject the built payload into a real browser page
  capture --url <page> [--target name=css]... [--experiment id] [--survey] [--page type] [--mobile] [--headed] [--share]
                               observe a live page: selector uniqueness, DOM, styles, sanitized (captures/)
  capture list | report <id> | validate [id] | evidence <id> --experiment <id>
  doctor                       check your environment and configuration
`;

async function main() {
  const { cmd, pos, flags } = parseArgs(process.argv.slice(2));
  try {
    let code = 0;
    if (!cmd || cmd === 'help' || flags.help) console.log(HELP);
    else if (cmd === 'init') await runInit({ flags });
    else if (cmd === 'new') runNew({ id: pos[0], flags });
    else if (cmd === 'validate') code = runValidate({ id: pos[0] });
    else if (cmd === 'build') code = await runBuild({ id: pos[0], flags });
    else if (cmd === 'preview') code = await runPreview({ id: pos[0], flags });
    else if (cmd === 'capture') code = await runCapture(['list', 'show', 'report', 'validate', 'evidence'].includes(pos[0]) ? { sub: pos[0], pos: pos.slice(1), flags } : { flags });
    else if (cmd === 'doctor') code = await runDoctor();
    else { console.error(`unknown command: ${cmd}\n\n${HELP}`); code = 2; }
    process.exitCode = code;
  } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
}

main();
