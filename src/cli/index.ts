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

program
  .command('grant-membership')
  .description('Give an existing signed-in user access to an org')
  .requiredOption('--org <id>', 'org id')
  .requiredOption('--email <email>', 'the user, who must have signed in at least once')
  .option('--role <role>', 'owner | admin | member', 'member')
  .action(async (opts: { org: string; email: string; role: string }) => {
    const { grantMembershipCommand } = await import('./commands/membership.js');
    await grantMembershipCommand(Number(opts.org), opts.email, opts.role);
  });

program
  .command('revoke-membership')
  .description("Remove a user's access to an org")
  .requiredOption('--org <id>', 'org id')
  .requiredOption('--email <email>', 'the user')
  .action(async (opts: { org: string; email: string }) => {
    const { revokeMembershipCommand } = await import('./commands/membership.js');
    await revokeMembershipCommand(Number(opts.org), opts.email);
  });

program
  .command('list-memberships')
  .description('Show which orgs a user can see')
  .requiredOption('--email <email>', 'the user')
  .action(async (opts: { email: string }) => {
    const { listMembershipsCommand } = await import('./commands/membership.js');
    await listMembershipsCommand(opts.email);
  });

program
  .command('invite')
  .description('Let an address outside the signup allowlist join an org')
  .requiredOption('--org <id>', 'org id')
  .requiredOption('--email <email>', 'who to invite')
  .option('--role <role>', 'owner | admin | member', 'member')
  .action(async (opts: { org: string; email: string; role: string }) => {
    const { inviteCommand } = await import('./commands/membership.js');
    await inviteCommand(Number(opts.org), opts.email, opts.role);
  });

program
  .command('create-api-key')
  .description('Mint an MCP API key for an org; shown once')
  .requiredOption('--org <id>', 'org id')
  .option('--name <name>', 'label for the key', 'MCP key')
  .action(async (opts: { org: string; name: string }) => {
    const { createApiKeyCommand } = await import('./commands/membership.js');
    await createApiKeyCommand(Number(opts.org), opts.name);
  });

program
  .command('list-api-keys')
  .description("An org's MCP API keys, by prefix")
  .requiredOption('--org <id>', 'org id')
  .action(async (opts: { org: string }) => {
    const { listApiKeysCommand } = await import('./commands/membership.js');
    await listApiKeysCommand(Number(opts.org));
  });

program
  .command('revoke-api-key')
  .description('Revoke one MCP API key')
  .requiredOption('--org <id>', 'org id')
  .requiredOption('--key <id>', 'key id, from list-api-keys')
  .action(async (opts: { org: string; key: string }) => {
    const { revokeApiKeyCommand } = await import('./commands/membership.js');
    await revokeApiKeyCommand(Number(opts.org), Number(opts.key));
  });

program
  .command('seed-dev-user')
  .description('Create a password user for the Playwright harness (never in production)')
  .requiredOption('--email <email>', 'the user')
  .requiredOption('--password <password>', 'the password')
  .option('--org <id>', 'org to grant owner on', '1')
  .action(async (opts: { email: string; password: string; org: string }) => {
    const { seedDevUser } = await import('./commands/seed-dev-user.js');
    await seedDevUser(opts.email, opts.password, Number(opts.org));
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
