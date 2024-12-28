#!/usr/bin/env node

import { commands } from '../app/lib/db-utils';

const command = process.argv[2];

if (commands[command as keyof typeof commands]) {
  commands[command as keyof typeof commands]()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
} else {
  console.log(`
Available commands:
  show   - Display all data in the database
  clear  - Remove all data but keep tables
  reset  - Delete and recreate the database
  stats  - Show database statistics
  
Usage: npm run db <command>
  `);
  process.exit(1);
}