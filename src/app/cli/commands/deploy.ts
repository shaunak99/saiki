import * as p from '@clack/prompts';
import chalk from 'chalk';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { logger } from '@core/index.js';

export interface DeployOptions {
    mode?: 'web' | 'server' | 'discord' | 'telegram' | 'custom';
    configFile?: string;
    platform?: 'docker' | 'docker-compose' | 'railway' | 'render' | 'fly';
    environment?: 'development' | 'staging' | 'production';
    port?: number;
    name?: string;
    push?: boolean;
    detach?: boolean;
    dryRun?: boolean;
}

export interface DeploymentConfig {
    name: string;
    mode: string;
    configFile: string;
    platform: string;
    environment: string;
    port: number;
    imageTag: string;
    containerName: string;
}

/**
 * Main deploy command handler
 */
export async function deployAgent(options: DeployOptions = {}): Promise<void> {
    try {
        p.intro(chalk.inverse('🚀 Saiki Deploy'));

        // Validate prerequisites
        await validatePrerequisites();

        // Get deployment configuration
        const config = await getDeploymentConfig(options);

        // Execute deployment based on platform
        switch (config.platform) {
            case 'docker':
                await deployToDocker(config);
                break;
            case 'docker-compose':
                await deployToDockerCompose(config);
                break;
            case 'railway':
                await deployToRailway(config);
                break;
            case 'render':
                await deployToRender(config);
                break;
            case 'fly':
                await deployToFly(config);
                break;
            default:
                throw new Error(`Unsupported platform: ${config.platform}`);
        }

        p.outro(
            chalk.greenBright(
                `✅ Agent '${config.name}' deployed successfully!\n` +
                    `Mode: ${config.mode}\n` +
                    `Platform: ${config.platform}\n` +
                    `Environment: ${config.environment}`
            )
        );
    } catch (error) {
        logger.error(`Deployment failed: ${error}`);
        p.cancel('Deployment cancelled');
        process.exit(1);
    }
}

/**
 * Validate deployment prerequisites
 */
async function validatePrerequisites(): Promise<void> {
    const spinner = p.spinner();
    spinner.start('Validating prerequisites...');

    // Check Docker availability
    try {
        execSync('docker --version', { stdio: 'pipe' });
        logger.debug('Docker is available');
    } catch {
        spinner.stop('Docker not found');
        const shouldContinue = await p.confirm({
            message: 'Docker is not running or not installed. Continue with dry-run mode?',
            initialValue: true,
        });

        if (!shouldContinue) {
            throw new Error('Docker is required for deployment. Please install Docker first.');
        }

        logger.warn('Running in dry-run mode - commands will be logged but not executed');
        // Set a global flag for dry-run mode
        (global as any).dryRunMode = true;
    }

    // Check for required files
    const requiredFiles = ['package.json', 'Dockerfile'];
    for (const file of requiredFiles) {
        if (!existsSync(file)) {
            spinner.stop(`Missing ${file}`);
            throw new Error(`Required file not found: ${file}`);
        }
    }

    // Check for .env file
    if (!existsSync('.env')) {
        logger.warn('No .env file found. Make sure to set environment variables for your agent.');
    }

    spinner.stop('Prerequisites validated');
}

/**
 * Get deployment configuration from user input or options
 */
async function getDeploymentConfig(options: DeployOptions): Promise<DeploymentConfig> {
    const config: Partial<DeploymentConfig> = {};

    // Agent name
    if (options.name) {
        config.name = options.name;
    } else {
        config.name = (await p.text({
            message: 'Enter a name for your agent deployment:',
            placeholder: 'my-saiki-agent',
            validate: (value) => {
                if (!value) return 'Agent name is required';
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Name must contain only lowercase letters, numbers, and hyphens';
                }
                return undefined;
            },
        })) as string;
    }

    // Validate and sanitize the name
    config.name = config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (config.name.length > 50) {
        config.name = config.name.substring(0, 50);
    }

    // Deployment mode
    if (options.mode) {
        config.mode = options.mode;
    } else {
        config.mode = (await p.select({
            message: 'Select deployment mode:',
            options: [
                { value: 'web', label: '🌐 Web UI - Interactive web interface' },
                { value: 'server', label: '⚡ Server - REST API + WebSocket endpoints only' },
                { value: 'discord', label: '🤖 Discord Bot - Discord integration' },
                { value: 'telegram', label: '📱 Telegram Bot - Telegram integration' },
                { value: 'custom', label: '⚙️  Custom - Use specific config file' },
            ],
        })) as string;
    }

    // Config file selection
    if (config.mode === 'custom') {
        if (options.configFile) {
            config.configFile = options.configFile;
        } else {
            const configFiles = getAvailableConfigFiles();
            config.configFile = (await p.select({
                message: 'Select configuration file:',
                options: configFiles.map((file) => ({
                    value: file,
                    label: path.basename(file),
                })),
            })) as string;
        }
    } else {
        config.configFile = options.configFile || 'configuration/saiki.yml';
    }

    // Platform selection
    if (options.platform) {
        config.platform = options.platform;
    } else {
        config.platform = (await p.select({
            message: 'Select deployment platform:',
            options: [
                { value: 'docker', label: '🐳 Docker - Local container deployment' },
                { value: 'docker-compose', label: '🎼 Docker Compose - Multi-service deployment' },
                { value: 'railway', label: '🚂 Railway - Cloud platform deployment' },
                { value: 'render', label: '🎨 Render - Cloud platform deployment' },
                { value: 'fly', label: '🪰 Fly.io - Edge deployment platform' },
            ],
        })) as string;
    }

    // Environment
    if (options.environment) {
        config.environment = options.environment;
    } else {
        config.environment = (await p.select({
            message: 'Select environment:',
            options: [
                { value: 'development', label: '🔧 Development' },
                { value: 'staging', label: '🧪 Staging' },
                { value: 'production', label: '🚀 Production' },
            ],
        })) as string;
    }

    // Port configuration
    const defaultPort = config.mode === 'web' ? 3000 : config.mode === 'server' ? 3001 : 3000;
    config.port = options.port || defaultPort;

    // Generate derived properties
    config.imageTag = `saiki-${config.name}:${config.environment}`;
    config.containerName = `saiki-${config.name}-${config.environment}`;

    return config as DeploymentConfig;
}

/**
 * Execute command with dry-run support
 */
function executeCommand(command: string, options: any = {}): string {
    const isDryRun = (global as any).dryRunMode;

    if (isDryRun) {
        logger.info(`[DRY-RUN] Would execute: ${command}`);
        return 'dry-run-output';
    }

    return execSync(command, options);
}

/**
 * Deploy to Docker
 */
async function deployToDocker(config: DeploymentConfig): Promise<void> {
    const spinner = p.spinner();
    const isDryRun = (global as any).dryRunMode;

    // Build Docker image
    spinner.start('Building Docker image...');
    try {
        logger.debug(`Building Docker image with command: docker build -t ${config.imageTag} .`);
        const buildOutput = executeCommand(`docker build -t ${config.imageTag} .`, {
            stdio: 'pipe',
            encoding: 'utf8',
        });
        logger.debug(`Docker build output: ${buildOutput}`);
        spinner.stop('Docker image built successfully');
    } catch (error) {
        spinner.stop('Failed to build Docker image');
        logger.error(`Docker build error: ${error}`);
        if (!isDryRun) {
            throw new Error(
                `Docker build failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    // Stop existing container if running
    try {
        logger.debug(`Stopping existing container: ${config.containerName}`);
        executeCommand(`docker stop ${config.containerName}`, { stdio: 'pipe' });
        executeCommand(`docker rm ${config.containerName}`, { stdio: 'pipe' });
        logger.debug(`Stopped and removed existing container: ${config.containerName}`);
    } catch (error) {
        // Container doesn't exist, continue
        logger.debug(`No existing container to stop: ${config.containerName}`);
    }

    // Run container
    spinner.start('Starting container...');
    const dockerRunCmd = generateDockerRunCommand(config);

    try {
        logger.debug(`Starting container with command: ${dockerRunCmd}`);
        const runOutput = executeCommand(dockerRunCmd, {
            stdio: 'pipe',
            encoding: 'utf8',
        });
        logger.debug(`Docker run output: ${runOutput}`);
        spinner.stop('Container started successfully');

        if (config.mode === 'web') {
            const frontendPort = config.port;
            const apiPort = config.port + 1;
            logger.info(`🌐 Frontend available at: http://localhost:${frontendPort}`);
            logger.info(`🔌 API server available at: http://localhost:${apiPort}`);
            logger.info(`🔗 WebSocket endpoint: ws://localhost:${apiPort}`);
        } else if (config.mode === 'server') {
            logger.info(`🔌 API server available at: http://localhost:${config.port}`);
            logger.info(`🔗 WebSocket endpoint: ws://localhost:${config.port}`);
        }

        logger.info(`📦 Container name: ${config.containerName}`);
        logger.info(`🏷️  Image tag: ${config.imageTag}`);

        if (!isDryRun) {
            // Wait a moment and check if container is actually running
            setTimeout(() => {
                try {
                    const statusOutput = executeCommand(
                        `docker ps --filter name=${config.containerName} --format "table {{.Names}}\t{{.Status}}"`,
                        {
                            stdio: 'pipe',
                            encoding: 'utf8',
                        }
                    );
                    logger.info(`Container status:\n${statusOutput}`);
                } catch (statusError) {
                    logger.warn(`Could not check container status: ${statusError}`);
                }
            }, 2000);
        }
    } catch (error) {
        spinner.stop('Failed to start container');
        logger.error(`Docker run error: ${error}`);
        if (!isDryRun) {
            throw new Error(
                `Container start failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}

/**
 * Deploy using Docker Compose
 */
async function deployToDockerCompose(config: DeploymentConfig): Promise<void> {
    const spinner = p.spinner();

    // Generate docker-compose override file
    const overrideFile = generateComposeOverride(config);
    writeFileSync('docker-compose.deploy.yml', overrideFile);

    spinner.start('Deploying with Docker Compose...');
    try {
        const service = config.mode === 'custom' ? 'agent' : config.mode;
        execSync(`docker compose -f compose.yaml -f docker-compose.deploy.yml up -d ${service}`, {
            stdio: 'pipe',
        });
        spinner.stop('Deployed successfully with Docker Compose');

        if (config.mode === 'web') {
            const frontendPort = config.port;
            const apiPort = config.port + 1;
            logger.info(`🌐 Frontend available at: http://localhost:${frontendPort}`);
            logger.info(`🔌 API server available at: http://localhost:${apiPort}`);
            logger.info(`🔗 WebSocket endpoint: ws://localhost:${apiPort}`);
        } else if (config.mode === 'server') {
            logger.info(`🔌 API server available at: http://localhost:${config.port}`);
            logger.info(`🔗 WebSocket endpoint: ws://localhost:${config.port}`);
        }
    } catch (error) {
        spinner.stop('Docker Compose deployment failed');
        throw new Error(`Deployment failed: ${error}`);
    }
}

/**
 * Deploy to Railway
 */
async function deployToRailway(config: DeploymentConfig): Promise<void> {
    const spinner = p.spinner();

    spinner.start('Deploying to Railway...');

    // Check if Railway CLI is installed
    try {
        execSync('railway --version', { stdio: 'pipe' });
    } catch {
        spinner.stop('Railway CLI not found');
        throw new Error(
            'Railway CLI is required. Install it from: https://docs.railway.app/develop/cli'
        );
    }

    // Create railway.json config
    const railwayConfig = generateRailwayConfig(config);
    writeFileSync('railway.json', JSON.stringify(railwayConfig, null, 2));

    try {
        // Deploy to Railway
        execSync('railway up', { stdio: 'pipe' });
        spinner.stop('Deployed to Railway successfully');

        // Get the deployment URL
        const url = execSync('railway domain', { stdio: 'pipe', encoding: 'utf8' }).trim();
        if (url) {
            logger.info(`🌐 Agent available at: ${url}`);
        }
    } catch (error) {
        spinner.stop('Railway deployment failed');
        throw new Error(`Railway deployment failed: ${error}`);
    }
}

/**
 * Deploy to Render
 */
async function deployToRender(config: DeploymentConfig): Promise<void> {
    const spinner = p.spinner();

    spinner.start('Preparing Render deployment...');

    // Create render.yaml config
    const renderConfig = generateRenderConfig(config);
    writeFileSync('render.yaml', renderConfig);

    spinner.stop('Render configuration created');

    logger.info('📝 Next steps for Render deployment:');
    logger.info('1. Commit render.yaml to your git repository');
    logger.info('2. Connect your repository to Render at https://render.com');
    logger.info('3. Render will automatically deploy your agent');
}

/**
 * Deploy to Fly.io
 */
async function deployToFly(config: DeploymentConfig): Promise<void> {
    const spinner = p.spinner();

    spinner.start('Deploying to Fly.io...');

    // Check if Fly CLI is installed
    try {
        execSync('fly version', { stdio: 'pipe' });
    } catch {
        spinner.stop('Fly CLI not found');
        throw new Error(
            'Fly CLI is required. Install it from: https://fly.io/docs/hands-on/install-fly/'
        );
    }

    // Create fly.toml config
    const flyConfig = generateFlyConfig(config);
    writeFileSync('fly.toml', flyConfig);

    try {
        // Launch app if it doesn't exist
        try {
            execSync(`fly apps create ${config.name}`, { stdio: 'pipe' });
        } catch {
            // App already exists
        }

        // Deploy to Fly
        execSync('fly deploy', { stdio: 'pipe' });
        spinner.stop('Deployed to Fly.io successfully');

        // Get the app URL
        const url = `https://${config.name}.fly.dev`;
        logger.info(`🌐 Agent available at: ${url}`);
    } catch (error) {
        spinner.stop('Fly.io deployment failed');
        throw new Error(`Fly.io deployment failed: ${error}`);
    }
}

// Helper functions
function getAvailableConfigFiles(): string[] {
    const configDir = 'configuration';
    if (!existsSync(configDir)) return ['configuration/saiki.yml'];

    try {
        const files = require('fs')
            .readdirSync(configDir)
            .filter((file: string) => file.endsWith('.yml') || file.endsWith('.yaml'))
            .map((file: string) => path.join(configDir, file));
        return files.length > 0 ? files : ['configuration/saiki.yml'];
    } catch {
        return ['configuration/saiki.yml'];
    }
}

function generateDockerRunCommand(config: DeploymentConfig): string {
    const envFile = existsSync('.env') ? '--env-file .env' : '';
    const modeArgs =
        config.mode === 'custom'
            ? `--config-file /usr/src/app/agent-config.yml --mode web`
            : `--mode ${config.mode}`;

    const volumeMounts =
        config.mode === 'custom'
            ? `-v ${path.resolve(config.configFile)}:/usr/src/app/agent-config.yml:ro`
            : '';

    // Handle port mapping based on mode
    let portMapping = '';
    if (config.mode === 'web') {
        // Web mode needs both frontend and API ports
        const frontendPort = config.port;
        const apiPort = config.port + 1;
        portMapping = `-p ${frontendPort}:3000 -p ${apiPort}:3001`;
    } else if (config.mode === 'server') {
        // Server mode only needs API port
        portMapping = `-p ${config.port}:3001`;
    }

    // Set container environment variables for proper port configuration
    const containerEnv = [];
    if (config.mode === 'web') {
        containerEnv.push(`-e FRONTEND_PORT=3000`);
        containerEnv.push(`-e API_PORT=3001`);
        containerEnv.push(`-e API_URL=http://localhost:3001`);
        containerEnv.push(`-e FRONTEND_URL=http://localhost:3000`);
        containerEnv.push(`-e NEXT_PUBLIC_API_URL=http://localhost:${config.port + 1}`);
        containerEnv.push(`-e NEXT_PUBLIC_WS_URL=ws://localhost:${config.port + 1}`);
    } else if (config.mode === 'server') {
        containerEnv.push(`-e API_PORT=3001`);
    }

    return [
        'docker run -d',
        `--name ${config.containerName}`,
        envFile,
        ...containerEnv,
        portMapping,
        volumeMounts,
        `--restart unless-stopped`,
        config.imageTag,
        modeArgs,
        config.mode === 'web'
            ? `--web-port 3000`
            : config.mode === 'server'
              ? `--web-port 3001`
              : '',
    ]
        .filter(Boolean)
        .join(' ');
}

function generateComposeOverride(config: DeploymentConfig): string {
    const serviceName = config.mode === 'custom' ? 'agent' : config.mode;

    let ports = '';
    if (config.mode === 'web') {
        // Web mode needs both frontend and API ports
        const frontendPort = config.port;
        const apiPort = config.port + 1;
        ports = `ports:
      - "${frontendPort}:3000"
      - "${apiPort}:3001"`;
    } else if (config.mode === 'server') {
        // Server mode only needs API port
        ports = `ports:
      - "${config.port}:3001"`;
    }

    return `# Generated override for ${config.name}
services:
  ${serviceName}:
    container_name: ${config.containerName}
    environment:
      - NODE_ENV=${config.environment}
      ${
          config.mode === 'web'
              ? `- FRONTEND_PORT=3000
      - API_PORT=3001
      - API_URL=http://localhost:3001
      - FRONTEND_URL=http://localhost:3000
      - NEXT_PUBLIC_API_URL=http://localhost:${config.port + 1}
      - NEXT_PUBLIC_WS_URL=ws://localhost:${config.port + 1}`
              : config.mode === 'server'
                ? `- API_PORT=3001`
                : ''
      }
    ${ports}
`;
}

function generateRailwayConfig(config: DeploymentConfig): object {
    return {
        build: {
            dockerfile: 'Dockerfile',
        },
        deploy: {
            startCommand: `node dist/src/app/index.js --mode ${config.mode} --web-port $PORT ${config.mode === 'custom' ? `--config-file ${config.configFile}` : ''}`,
            restartPolicyType: 'always',
        },
    };
}

function generateRenderConfig(config: DeploymentConfig): string {
    return `services:
  - type: web
    name: ${config.name}
    env: docker
    plan: starter
    dockerfilePath: ./Dockerfile
    envVars:
      - key: NODE_ENV
        value: ${config.environment}
      - key: PORT
        value: "3000"
    startCommand: node dist/src/app/index.js --mode ${config.mode} --web-port 3000 ${config.mode === 'custom' ? `--config-file ${config.configFile}` : ''}
`;
}

function generateFlyConfig(config: DeploymentConfig): string {
    return `app = "${config.name}"
primary_region = "lax"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "${config.environment}"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
`;
}
