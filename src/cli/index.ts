import { Command } from 'commander';

const program = new Command();

program.name('invoice-mcp').description('InvoiceMCP CLI');

program
  .command('check-connections')
  .description('Verify Postgres, MongoDB, and Redis are reachable')
  .action(async () => {
    const { checkConnections } = await import('./commands/check-connections.js');
    await checkConnections();
  });

program
  .command('seed-org')
  .description('Create the initial client.org row')
  .requiredOption('--name <name>', 'organization name')
  .action(async (opts: { name: string }) => {
    const { seedOrg } = await import('./commands/seed-org.js');
    await seedOrg(opts.name);
  });

program
  .command('auth')
  .description('Connect a Gmail account via OAuth (loopback flow)')
  .option('--org <id>', 'org id', '1')
  .action(async (opts: { org: string }) => {
    const { auth } = await import('./commands/auth.js');
    await auth(Number(opts.org));
  });

program
  .command('discover')
  .description('Enqueue a whole-mailbox billing-sender discovery scan')
  .option('--account <id>', 'account id', '1')
  .action(async (opts: { account: string }) => {
    const { discover } = await import('./commands/discover.js');
    await discover(Number(opts.account));
  });

program
  .command('backfill')
  .description('Enqueue full-history backfill for one service sender')
  .requiredOption('--service <id>', 'service id')
  .option('--account <id>', 'account id', '1')
  .action(async (opts: { service: string; account: string }) => {
    const { backfill } = await import('./commands/backfill.js');
    await backfill(Number(opts.account), Number(opts.service));
  });

program
  .command('categorize')
  .description('Backfill usage categories for invoice line items')
  .option('--org <id>', 'org id', '1')
  .option('--limit <n>', 'max invoices to process', '200')
  .option('--force', 're-categorize line items that already have a category', false)
  .action(async (opts: { org: string; limit: string; force: boolean }) => {
    const { categorize } = await import('./commands/categorize.js');
    await categorize({ orgId: Number(opts.org), limit: Number(opts.limit), force: opts.force });
  });

program
  .command('sync')
  .description('Run an incremental sync for all active accounts now')
  .action(async () => {
    const { sync } = await import('./commands/sync.js');
    await sync();
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
