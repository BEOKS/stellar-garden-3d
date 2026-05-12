import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

const config = {
  dokployUrl: process.env.DOKPLOY_URL || 'https://console.onestack.run',
  token: process.env.DOKPLOY_API_KEY || process.env.DOKPLOY_AUTH_TOKEN,
  cfClientId: process.env.CF_ACCESS_CLIENT_ID,
  cfClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
  projectName: process.env.DOKPLOY_PROJECT_NAME || 'stellar-garden-3d',
  environmentName: process.env.DOKPLOY_ENVIRONMENT || 'production',
  composeName: process.env.DOKPLOY_COMPOSE_NAME || 'stellar-garden-3d',
  host: process.env.DOKPLOY_HOST || 'stellar-garden-3d.onestack.run',
  serviceName: process.env.DOKPLOY_SERVICE_NAME || 'stellar-garden-3d',
  port: Number(process.env.PORT || process.env.DOKPLOY_PORT || 4877),
  repo: process.env.GITHUB_REPOSITORY || 'BEOKS/stellar-garden-3d',
  gitUrl: process.env.DOKPLOY_GIT_URL || 'https://github.com/BEOKS/stellar-garden-3d.git',
  branch: process.env.DOKPLOY_GIT_BRANCH || 'main',
  composePath: process.env.DOKPLOY_COMPOSE_PATH || 'docker-compose.yml'
};

if (!config.token) {
  throw new Error('DOKPLOY_API_KEY or DOKPLOY_AUTH_TOKEN must be set in the local environment.');
}

if (config.dokployUrl.includes('console.onestack.run') && (!config.cfClientId || !config.cfClientSecret)) {
  throw new Error('CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET must be set for https://console.onestack.run.');
}

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error(`Invalid port: ${config.port}`);
}

function endpointUrl(endpoint) {
  return new URL(`${config.dokployUrl.replace(/\/$/, '')}/api/trpc/${endpoint}`);
}

async function request(method, endpoint, payload = {}) {
  const url = endpointUrl(endpoint);
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.token
  };

  if (config.cfClientId && config.cfClientSecret) {
    headers['CF-Access-Client-Id'] = config.cfClientId;
    headers['CF-Access-Client-Secret'] = config.cfClientSecret;
  }

  const options = { method, headers };
  if (method === 'GET') {
    url.searchParams.set('input', JSON.stringify({ json: payload }));
  } else {
    options.body = JSON.stringify({ json: payload });
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw response body for the error below.
  }

  if (!response.ok) {
    const message = body?.error?.json?.message || body?.message || text || response.statusText;
    throw new Error(`${endpoint} failed (${response.status}): ${message}`);
  }

  return body?.result?.data?.json ?? body;
}

function findProject(projects) {
  return projects.find((project) => project.name === config.projectName);
}

function findEnvironment(project) {
  return project?.environments?.find((environment) => environment.name === config.environmentName);
}

function findCompose(environment) {
  return environment?.compose?.find((compose) => compose.name === config.composeName || compose.appName === config.composeName);
}

async function ensureProjectAndEnvironment() {
  let projects = await request('GET', 'project.all');
  let project = findProject(projects);
  if (!project) {
    const created = await request('POST', 'project.create', {
      name: config.projectName,
      description: 'Sample app deployed from GitHub Actions'
    });

    return {
      projectId: created.project.projectId,
      environmentId: created.environment.environmentId
    };
  }

  let environment = findEnvironment(project);
  if (!environment) {
    environment = await request('POST', 'environment.create', {
      name: config.environmentName,
      description: config.environmentName,
      projectId: project.projectId
    });
  }

  return {
    projectId: project.projectId,
    environmentId: environment.environmentId
  };
}

async function ensureCompose(environmentId) {
  const composeFile = fs.readFileSync(path.join(projectDir, config.composePath), 'utf8');
  let projects = await request('GET', 'project.all');
  let project = findProject(projects);
  let environment = findEnvironment(project);
  let compose = findCompose(environment);

  if (!compose) {
    compose = await request('POST', 'compose.create', {
      name: config.composeName,
      appName: config.composeName,
      description: 'Git-backed sample app',
      environmentId,
      composeType: 'docker-compose',
      composeFile
    });
  }

  const composeId = compose.composeId;
  await request('POST', 'compose.update', {
    composeId,
    name: config.composeName,
    appName: config.composeName,
    description: 'Git-backed sample app',
    sourceType: 'git',
    composeType: 'docker-compose',
    composeFile,
    customGitUrl: config.gitUrl,
    customGitBranch: config.branch,
    composePath: config.composePath
  });

  return composeId;
}

async function ensureDomain(composeId) {
  const domains = await request('GET', 'domain.byComposeId', { composeId });
  const existing = domains.find((domain) => domain.host === config.host && domain.serviceName === config.serviceName);
  if (existing) return existing.domainId;

  const domain = await request('POST', 'domain.create', {
    host: config.host,
    path: '/',
    port: config.port,
    composeId,
    serviceName: config.serviceName,
    domainType: 'compose',
    certificateType: 'none',
    internalPath: '/'
  });

  return domain.domainId;
}

function setGithubSecret(name, value) {
  if (!value) return false;
  try {
    execFileSync('gh', ['secret', 'set', name, '--repo', config.repo], {
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'pipe']
    });
    return true;
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`Failed to set GitHub secret ${name}: ${detail}`);
  }
}

async function main() {
  console.log(`Configuring Dokploy compose for ${config.gitUrl} (${config.branch}).`);
  const { environmentId } = await ensureProjectAndEnvironment();
  const composeId = await ensureCompose(environmentId);
  await ensureDomain(composeId);

  setGithubSecret('DOKPLOY_COMPOSE_ID', composeId);
  setGithubSecret('DOKPLOY_API_KEY', config.token);
  setGithubSecret('CF_ACCESS_CLIENT_ID', config.cfClientId);
  setGithubSecret('CF_ACCESS_CLIENT_SECRET', config.cfClientSecret);

  await request('POST', 'compose.deploy', {
    composeId,
    title: 'Initial GitHub-backed deploy',
    description: `${config.gitUrl}#${config.branch}`
  });

  console.log(`Dokploy compose configured: ${config.composeName}`);
  console.log(`Public host: ${config.host}`);
  console.log('GitHub Actions secrets synced.');
  console.log('Initial deployment queued.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
