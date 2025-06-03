# 🚀 Saiki Agent Deployment Guide

Deploy your Saiki AI agents effortlessly to multiple platforms with the built-in `saiki deploy` command.

## Quick Start

```bash
# Interactive deployment wizard
saiki deploy

# Deploy specific mode and platform
saiki deploy --mode web --platform docker --name my-agent

# Deploy to cloud platform
saiki deploy --mode server --platform railway --environment production

# Deploy a Discord bot to Railway  
saiki deploy --mode discord --platform railway --environment production

# Deploy a custom agent with specific config
saiki deploy --mode custom --config-file ./configuration/my-agent.yml --platform fly
```

## Prerequisites

1. **Docker** (required for all deployments)
   ```bash
   # Install Docker Desktop or Docker Engine
   docker --version
   ```

2. **Platform-specific CLIs** (for cloud deployments):
   - **Railway**: `npm install -g @railway/cli`
   - **Fly.io**: Install from https://fly.io/docs/hands-on/install-fly/
   - **Render**: No CLI required (uses git-based deployment)

3. **Environment Variables**
   Create a `.env` file with your AI provider API keys:
   ```bash
   OPENAI_API_KEY=your_key_here
   ANTHROPIC_API_KEY=your_key_here
   GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
   ```

## Deployment Modes

### 🌐 Web UI
Deploy the full web interface with both frontend and API server.
```bash
saiki deploy --mode web
```
- **Ports**: Uses dual-port setup
  - Frontend (Next.js): 3000
  - API + WebSocket: 3001
- **Features**: Interactive chat, MCP server management, session management
- **Best for**: Development, demos, interactive use

### 🔌 Server  
Deploy as a headless API server with REST and WebSocket endpoints.
```bash
saiki deploy --mode server
```
- **Port**: 3001 (API + WebSocket)
- **Features**: REST APIs, WebSocket events, MCP integration
- **Best for**: Production backends, API integrations

### 🤖 Discord Bot
Deploy as a Discord bot.
```bash
saiki deploy --mode discord
```
- **Requires**: `DISCORD_BOT_TOKEN` in environment
- **Best for**: Discord servers, community bots

### 📱 Telegram Bot
Deploy as a Telegram bot.
```bash
saiki deploy --mode telegram  
```
- **Requires**: `TELEGRAM_BOT_TOKEN` in environment
- **Best for**: Personal assistants, notification bots

### ⚙️ Custom Agent
Deploy with a specific configuration file.
```bash
saiki deploy --mode custom --config-file ./configuration/my-agent.yml
```
- **Best for**: Specialized agents, custom tool configurations

## Deployment Platforms

### 🐳 Docker (Local)
Deploy locally using Docker containers.

```bash
# Interactive setup
saiki deploy --platform docker

# With specific options
saiki deploy --mode web --platform docker --name my-agent --environment production
```

**Port Configuration:**
- **Web mode**: Maps host ports to both frontend (3000) and API (3001)
  ```bash
  # Example: Web mode on ports 8000-8001
  saiki deploy --mode web --port 8000
  # Maps: 8000->3000 (frontend), 8001->3001 (API)
  ```
- **Server mode**: Maps single port to API server (3001)
  ```bash
  # Example: Server mode on port 8080  
  saiki deploy --mode server --port 8080
  # Maps: 8080->3001 (API)
  ```

**WebSocket Connectivity:**
- Frontend automatically connects to correct API port
- Health checks monitor API server endpoint
- Container networking handles internal port routing

**Advantages:**
- Full control over deployment
- Works anywhere Docker runs
- Great for development and testing

**Management:**
```bash
# View running containers
docker ps

# View logs
docker logs saiki-my-agent-production

# Stop deployment
docker stop saiki-my-agent-production
```

### 🎼 Docker Compose
Multi-service deployment with Docker Compose.

```bash
saiki deploy --platform docker-compose --mode web
```

**Features:**
- Supports multiple modes simultaneously
- Built-in service networking
- Environment-specific configurations
- Volume persistence for data and logs
- Proper port isolation between services

**Port Mapping:**
```yaml
# Web service (example)
ports:
  - "3000:3000"  # Frontend
  - "3001:3001"  # API + WebSocket

# Server service (example)  
ports:
  - "3001:3001"  # API + WebSocket only
```

**Management:**
```bash
# View services
docker compose ps

# Scale services  
docker compose up --scale web=2

# View logs
docker compose logs web
```

### 🚂 Railway
One-click cloud deployment platform.

```bash
# Deploy to Railway
saiki deploy --platform railway --mode web --environment production

# With custom domain
railway domain
```

**Features:**
- Automatic SSL certificates
- Environment variable management
- Built-in monitoring and logs
- Custom domains

### 🎨 Render  
Git-based cloud deployment platform.

```bash
saiki deploy --platform render --mode server
```

**Process:**
1. Creates `render.yaml` configuration
2. Commit to your git repository  
3. Connect repository to Render
4. Automatic deployments on git push

### 🪰 Fly.io
Edge deployment platform for global distribution.

```bash
saiki deploy --platform fly --mode web --name global-agent
```

**Features:**
- Global edge deployment
- Automatic scaling
- Built-in load balancing
- Custom domains with SSL

## Environment Management

### Development
```bash
saiki deploy --environment development --mode web
```
- Debug logging enabled
- Development dependencies included
- Relaxed security settings

### Staging
```bash
saiki deploy --environment staging --mode server  
```
- Production-like environment
- Testing and validation
- Performance monitoring

### Production
```bash
saiki deploy --environment production --mode discord
```
- Optimized performance
- Security hardened
- Monitoring and alerting

## Configuration Examples

### E-commerce Assistant
```bash
# Deploy a shopping assistant with Puppeteer tools
saiki deploy \
  --mode custom \
  --config-file ./configuration/shopping-agent.yml \
  --platform railway \
  --environment production \
  --name shopping-bot
```

### API Integration Agent  
```bash
# Deploy as a server for backend integration
saiki deploy \
  --mode server \
  --platform docker-compose \
  --environment staging \
  --port 3001
```

### Discord Community Bot
```bash
# Deploy Discord bot to the cloud
saiki deploy \
  --mode discord \
  --platform fly \
  --environment production \
  --name community-assistant
```

## Monitoring and Maintenance

### Health Checks
All deployments include health monitoring:
```bash
# Check agent health
curl http://localhost:3000/health

# Response includes:
# - Service status
# - Uptime and memory usage  
# - Connected MCP servers
# - Environment information
```

### Logs
Access deployment logs:
```bash
# Docker
docker logs saiki-agent-production

# Docker Compose
docker compose logs web

# Railway
railway logs

# Fly.io  
fly logs
```

### Updates
Redeploy with newer versions:
```bash
# Rebuild and redeploy
saiki deploy --platform docker --name my-agent

# For cloud platforms, push to git or use platform CLI
```

## Troubleshooting

### Common Issues

**Docker build fails:**
```bash
# Check Docker daemon
docker info

# Clear build cache
docker system prune -a
```

**Missing environment variables:**
```bash
# Verify .env file exists
ls -la .env

# Check required variables
cat .env | grep API_KEY
```

**Port conflicts:**
```bash
# Check what's running on port
lsof -i :3000

# Use different port
saiki deploy --port 3001
```

**MCP server connection failures:**
```bash
# Check health endpoint
curl http://localhost:3000/health

# Verify server configuration
saiki --config-file ./configuration/debug.yml
```

### Platform-Specific Issues

**Railway deployment stuck:**
```bash
# Check build logs
railway logs --deployment

# Restart deployment
railway redeploy
```

**Fly.io resource limits:**
```bash
# Check app status
fly status

# Scale resources
fly scale memory 1024
```

**Render build timeout:**
- Increase build timeout in render.yaml
- Optimize Docker build with multi-stage builds

## Security Best Practices

1. **Environment Variables**: Never commit API keys to git
2. **Network Security**: Use HTTPS in production  
3. **Access Control**: Implement authentication for web deployments
4. **Resource Limits**: Set memory and CPU limits
5. **Updates**: Keep dependencies updated regularly

## Advanced Configurations

### Custom Dockerfile
Override the default build:
```dockerfile
# Custom Dockerfile.agent
FROM node:20-alpine
# Your custom configuration
```

```bash
# Use custom Dockerfile
docker build -f Dockerfile.agent -t my-custom-agent .
```

### Multi-Region Deployment
Deploy to multiple regions:
```bash
# Deploy to different Fly.io regions
fly deploy --region lax  # Los Angeles
fly deploy --region fra  # Frankfurt
```

### Load Balancing
Use platform load balancers:
```bash
# Railway: Automatic with custom domains
# Fly.io: Built-in global load balancing
# Render: Load balancing on paid plans
```

## Support and Resources

- **Documentation**: https://github.com/truffle-ai/saiki
- **Discord Community**: [Join Discord](https://discord.gg/GFzWFAAZcm)  
- **Issues**: Report bugs on GitHub Issues
- **Examples**: Check `configuration/examples/` directory

---

**Ready to deploy your AI agent?** Start with `saiki deploy` and follow the interactive setup! 