#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code ?? 0;
  },
  (err) => {
    process.stderr.write(`keepkeys: ${err?.message ?? err}\n`);
    if (process.env.KEEPKEYS_DEBUG) process.stderr.write(`${err?.stack}\n`);
    process.exitCode = err?.exitCode ?? 1;
  },
);
