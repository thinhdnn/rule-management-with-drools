# Live Demo Setup Guide

## 🔧 Setup Ngrok for Live Demos

To enable live demos with public URLs, you need to configure ngrok authentication token in your GitHub repository.

### Step 1: Get Ngrok Auth Token

1. **Sign up for ngrok account:**
   - Go to https://ngrok.com/
   - Create a free account
   - Verify your email

2. **Get your auth token:**
   - Login to ngrok dashboard
   - Go to "Your Authtoken" section
   - Copy your authtoken (format: `2abc...xyz`)

### Step 2: Add Token to GitHub Secrets

1. **Navigate to your GitHub repo settings:**
   ```
   https://github.com/YOUR_USERNAME/new-ui-with-drools/settings/secrets/actions
   ```

2. **Add new repository secret:**
   - Click "New repository secret"
   - Name: `NGROK_AUTH_TOKEN`
   - Value: Your ngrok authtoken (paste the token you copied)
   - Click "Add secret"

### Step 3: Test the Demo

```bash
# Install GitHub CLI if not already installed
# macOS: brew install gh
# Windows: Download from https://cli.github.com/

# Authenticate with GitHub
gh auth login

# Trigger a demo
./demo.sh -d 5 -m "Test Demo"
```

## 🎯 How It Works

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub        │    │   GitHub        │    │   Ngrok         │
│   Actions       │───▶│   Runner        │───▶│   Tunnels       │
│   Workflow      │    │   (Ubuntu)      │    │   (Public URLs) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌──────┴──────┐
                       │             │
                  ┌────▼───┐    ┌────▼───┐
                  │Backend │    │Frontend│
                  │:8080   │    │:3000   │
                  └────────┘    └────────┘
                       │
                  ┌────▼───┐
                  │PostgreSQL
                  │:5432   │
                  └────────┘
```

### Workflow Steps

1. **Build Phase:**
   - ✅ Checkout code
   - ✅ Setup Java 17 & Node.js 18
   - ✅ Start PostgreSQL service
   - ✅ Build Spring Boot backend
   - ✅ Build Next.js frontend

2. **Deploy Phase:**
   - 🌍 Install ngrok
   - 🚀 Start backend on port 8080
   - 🌐 Expose backend via ngrok tunnel
   - 🎨 Start frontend on port 3000 (with backend URL)
   - 🔗 Expose frontend via ngrok tunnel

3. **Demo Phase:**
   - 📝 Create GitHub issue with URLs
   - ⏰ Keep services running for specified duration
   - 📊 Show real-time logs
   - 🧹 Auto-cleanup after timeout

## 🎛️ Demo Controls

### Manual Trigger Options

```bash
# Quick demo (10 minutes)
./demo.sh

# Custom duration
./demo.sh -d 15

# With custom message
./demo.sh -m "Sprint Demo - User Stories 1-5"

# Via GitHub CLI directly
gh workflow run demo-deploy.yml \
  --field demo_duration="10" \
  --field demo_message="Custom Demo"
```

### GitHub UI Trigger

1. Go to your repo's "Actions" tab
2. Click "Live Demo with Ngrok" workflow
3. Click "Run workflow"
4. Set duration and message
5. Click "Run workflow"

## 🔍 Monitoring

### Real-time Monitoring

- **GitHub Actions logs:** Live workflow execution
- **Demo issue:** Automatically created with URLs
- **Service logs:** Backend/Frontend output in workflow

### Demo URLs Format

```
Frontend: https://abc123.ngrok-free.app
Backend:  https://def456.ngrok-free.app
```

### API Testing

```bash
# Health check
curl https://your-backend-url.ngrok-free.app/actuator/health

# List rules
curl https://your-backend-url.ngrok-free.app/api/rules

# Test with WCO data
curl -X POST https://your-backend-url.ngrok-free.app/api/rules/test \
  -H "Content-Type: application/json" \
  -d @json/goods-declaration-sample.json
```

## 🚨 Important Notes

### Security
- ⚠️ **Temporary URLs:** All URLs become inactive after demo ends
- 🔐 **No sensitive data:** Don't expose production databases
- 🕐 **Time-limited:** Max 15 minutes per demo session

### Limitations
- 📊 **Concurrent demos:** Only one demo per repo at a time
- 💾 **Data persistence:** Database resets with each demo
- 🌐 **Network:** Ngrok free tier has bandwidth limits

### Troubleshooting

**Common Issues:**

1. **"No ngrok token" error:**
   - Verify `NGROK_AUTH_TOKEN` is set in GitHub secrets
   - Check token format (should be alphanumeric)

2. **"Workflow failed" error:**
   - Check GitHub Actions logs
   - Verify repo permissions for GitHub Actions

3. **"Services not responding" error:**
   - Backend may need more time to start
   - Check PostgreSQL connection

**Get Help:**
- 📋 Check workflow logs in GitHub Actions
- 🐛 Create issue with error details
- 📧 Contact team for urgent demo needs

## 🎉 Demo Best Practices

### Before Demo
- ✅ Test workflow with short duration first
- ✅ Prepare demo scenarios/user stories
- ✅ Have WCO sample data ready

### During Demo
- 🎯 Focus on key features
- 📱 Share both frontend and backend URLs
- 💡 Demonstrate WCO data processing

### After Demo
- 📝 Document feedback in demo issue
- 🔄 Close demo issue when done
- 📊 Plan improvements based on feedback