#!/usr/bin/env node
import { main } from '../dist/pack.js';

process.exitCode = main(process.argv.slice(2));
