#!/usr/bin/env node
import { homedir } from "node:os";
import { main } from "./main";

main(process.argv.slice(2), {
  env: process.env,
  home: homedir(),
  stdout: line => process.stdout.write(line),
  stderr: line => process.stderr.write(line),
  fetch,
}).then(
  code => { process.exitCode = code; },
  error => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  },
);
