# Fly.io Deployment Commands for Saiki Agent

## Prerequisites
Make sure you have the Fly CLI installed and are logged in.

---

## 🪟 Windows (PowerShell)

### 1. Install Fly CLI (if not already installed)
```powershell
# Run PowerShell as Administrator
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Login to Fly.io
```powershell
fly auth login
```

### 3. Create the app (only needed once)
```powershell
fly apps create my-saiki-agent
```

### 4. Set environment variables/secrets
```powershell
# Set your OpenAI API key (choose one of the providers)
fly secrets set OPENAI_API_KEY="your-openai-api-key-here"

# OR set Anthropic API key
fly secrets set ANTHROPIC_API_KEY="your-anthropic-api-key-here"

# OR set Google AI API key  
fly secrets set GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-api-key-here"

# Set the base URL for the agent
fly secrets set SAIKI_BASE_URL="https://my-saiki-agent.fly.dev"

# Optional: Set Node environment
fly secrets set NODE_ENV="production"
```

### 5. Deploy the application
```powershell
fly deploy
```

### 6. Check deployment status
```powershell
fly status
fly logs
```

### 7. Open your deployed app
```powershell
fly open
```

---

## 🐧 Linux/Unix/macOS (Bash/Zsh)

### 1. Install Fly CLI (if not already installed)
```bash
# For Linux/WSL
curl -L https://fly.io/install.sh | sh

# For macOS (using Homebrew - recommended)
brew install flyctl

# Or using curl on macOS
curl -L https://fly.io/install.sh | sh
```

### 2. Login to Fly.io
```bash
fly auth login
```

### 3. Create the app (only needed once)
```bash
fly apps create my-saiki-agent
```

### 4. Set environment variables/secrets
```bash
# Set your OpenAI API key (choose one of the providers)
fly secrets set OPENAI_API_KEY="your-openai-api-key-here"

# OR set Anthropic API key
fly secrets set ANTHROPIC_API_KEY="your-anthropic-api-key-here"

# OR set Google AI API key  
fly secrets set GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-api-key-here"

# Set the base URL for the agent
fly secrets set SAIKI_BASE_URL="https://my-saiki-agent.fly.dev"

# Optional: Set Node environment
fly secrets set NODE_ENV="production"
```

### 5. Deploy the application
```bash
fly deploy
```

### 6. Check deployment status
```bash
fly status
fly logs
```

### 7. Open your deployed app
```bash
fly open
```

---

## 🛠️ Useful Commands (Cross-platform)

### View app info
```bash
fly info
```

### Scale the app
```bash
fly scale count 1
```

### View secrets
```bash
fly secrets list
```

### SSH into the container
```bash
fly ssh console
```

### Monitor logs in real-time
```bash
fly logs -f
```

---

## 🌐 API Endpoints
Once deployed, your Saiki agent will be available at:
- **Base URL**: `https://my-saiki-agent.fly.dev`
- **Health Check**: `https://my-saiki-agent.fly.dev/health`
- **Send Message**: `POST https://my-saiki-agent.fly.dev/api/message-sync`
- **Reset Chat**: `POST https://my-saiki-agent.fly.dev/api/reset`
- **MCP Servers**: `GET https://my-saiki-agent.fly.dev/api/mcp/servers`
- **WebSocket**: `wss://my-saiki-agent.fly.dev`

---

## 🧪 Testing Your Deployment

### Using curl (Linux/macOS/WSL)
```bash
# Health check
curl https://my-saiki-agent.fly.dev/health

# Send a message
curl -X POST https://my-saiki-agent.fly.dev/api/message-sync \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Saiki!"}'

# List MCP servers
curl https://my-saiki-agent.fly.dev/api/mcp/servers
```

### Using PowerShell (Windows)
```powershell
# Health check
Invoke-RestMethod -Uri "https://my-saiki-agent.fly.dev/health"

# Send a message
$body = @{
    message = "Hello, Saiki!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://my-saiki-agent.fly.dev/api/message-sync" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

# List MCP servers
Invoke-RestMethod -Uri "https://my-saiki-agent.fly.dev/api/mcp/servers"
```

---

## 🔧 Troubleshooting

### Check app status
```bash
fly status
```

### View recent logs
```bash
fly logs
```

### Follow logs in real-time
```bash
fly logs -f
```

### Restart the app
```bash
fly apps restart my-saiki-agent
```

### Scale up if needed
```bash
fly scale count 1 --region iad
```

### Update secrets if needed
```bash
fly secrets set OPENAI_API_KEY="new-api-key"
``` 