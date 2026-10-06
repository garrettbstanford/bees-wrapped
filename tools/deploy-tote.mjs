// Separate stack and build output: this never uploads or modifies Bees Wrapped.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildHosting } from './build-hosting.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = process.env.AWS_PROFILE || 'aether-prod';
const region = 'us-east-1';
const stack = 'bees-tote';
const account = '200159632733';

function aws(args, capture = false) {
  const result = spawnSync('aws', [...args, '--profile', profile, '--region', region, '--no-cli-pager'], {
    cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: { ...process.env, AWS_PAGER: '' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`aws ${args.slice(0, 2).join(' ')} failed. If the session expired, run: aws sso login --profile ${profile}`);
  return capture ? JSON.parse(result.stdout) : undefined;
}

try {
  if (!existsSync(root + 'tote/dist/index.html')) throw new Error('Run npm run build:tote first.');
  const template = buildHosting('tote');
  const identity = aws(['sts', 'get-caller-identity', '--output', 'json'], true);
  if (identity.Account !== account) throw new Error(`Expected Aether production account ${account}; signed into ${identity.Account}.`);
  console.log('Provisioning totebag.builtbyaether.com…');
  aws(['cloudformation', 'deploy', '--stack-name', stack,
    '--template-file', template, '--no-fail-on-empty-changeset',
    '--tags', 'Project=bees-tote', 'ManagedBy=CloudFormation']);
  const result = aws(['cloudformation', 'describe-stacks', '--stack-name', stack, '--output', 'json'], true);
  const outputs = Object.fromEntries(result.Stacks[0].Outputs.map(item => [item.OutputKey, item.OutputValue]));
  for (const key of ['BucketName', 'DistributionId', 'SiteUrl']) {
    if (!outputs[key]) throw new Error(`Stack output ${key} is missing.`);
  }
  // Upload assets first, then HTML, so visitors never receive HTML pointing at absent JS.
  aws(['s3', 'cp', 'tote/dist/', `s3://${outputs.BucketName}/`, '--recursive',
    '--exclude', 'index.html', '--exclude', '.*', '--exclude', '*/.*',
    '--cache-control', 'public,max-age=0,s-maxage=300,must-revalidate', '--only-show-errors']);
  aws(['s3', 'cp', 'tote/dist/index.html', `s3://${outputs.BucketName}/index.html`,
    '--content-type', 'text/html; charset=utf-8',
    '--cache-control', 'public,max-age=0,s-maxage=300,must-revalidate', '--only-show-errors']);
  const invalidation = aws(['cloudfront', 'create-invalidation', '--distribution-id', outputs.DistributionId,
    '--paths', '/*', '--output', 'json'], true);
  aws(['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', outputs.DistributionId,
    '--id', invalidation.Invalidation.Id]);
  console.log(`Published: ${outputs.SiteUrl}`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
