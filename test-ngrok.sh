#!/bin/bash

# Local Ngrok Test Script for Drools UI

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Cleanup function
cleanup() {
    print_info "Cleaning up..."
    
    # Kill background processes
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    # Kill ngrok processes
    pkill ngrok 2>/dev/null || true
    
    print_info "Cleanup completed"
    exit 0
}

# Set trap for cleanup
trap cleanup SIGINT SIGTERM

print_header "Local Ngrok Test for Drools UI"

# Check if ngrok is configured
if ! ngrok config check &>/dev/null; then
    print_error "Ngrok is not properly configured!"
    print_info "Run: ngrok config add-authtoken YOUR_TOKEN"
    exit 1
fi

print_info "✅ Ngrok is configured"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_info "✅ Project structure found"

print_warn "This will start the full application stack locally and expose it via ngrok"
print_warn "Make sure you have Docker running for the database"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Test cancelled."
    exit 0
fi

print_header "Starting Services"

# Start database
print_info "Starting PostgreSQL database..."
docker-compose -f docker-compose.dev.yml up -d postgres
sleep 3

# Wait for database
print_info "Waiting for database to be ready..."
timeout=30
while [ $timeout -gt 0 ]; do
    if docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U postgres -d rule_engine >/dev/null 2>&1; then
        print_info "✅ Database is ready"
        break
    fi
    echo "Waiting for database... ($timeout seconds left)"
    sleep 2
    timeout=$((timeout-2))
done

if [ $timeout -eq 0 ]; then
    print_error "Database failed to start"
    exit 1
fi

# Build and start backend
print_info "Building backend..."
cd backend
chmod +x ./gradlew
./gradlew build -x test

print_info "Starting backend..."
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/rule_engine
export SPRING_DATASOURCE_USERNAME=postgres
export SPRING_DATASOURCE_PASSWORD=postgres
export SPRING_JPA_HIBERNATE_DDL_AUTO=update

nohup java -jar build/libs/*.jar > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
print_info "Waiting for backend to start..."
timeout=60
while [ $timeout -gt 0 ]; do
    if curl -f http://localhost:8080/actuator/health >/dev/null 2>&1; then
        print_info "✅ Backend started successfully"
        break
    fi
    echo "Waiting for backend... ($timeout seconds left)"
    sleep 2
    timeout=$((timeout-2))
done

if [ $timeout -eq 0 ]; then
    print_error "Backend failed to start"
    cleanup
fi

# Start ngrok for backend
print_info "Starting ngrok for backend..."
nohup ngrok http 8080 --log=stdout > ngrok-backend.log 2>&1 &
sleep 5

# Get backend URL
BACKEND_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
if [ "$BACKEND_URL" = "null" ] || [ -z "$BACKEND_URL" ]; then
    print_error "Failed to get backend ngrok URL"
    cleanup
fi

print_info "✅ Backend exposed at: $BACKEND_URL"

# Build and start frontend
print_info "Installing frontend dependencies..."
cd frontend
npm ci

print_info "Building frontend..."
export NEXT_PUBLIC_API_URL=$BACKEND_URL
npm run build

print_info "Starting frontend..."
nohup npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend
print_info "Waiting for frontend to start..."
timeout=30
while [ $timeout -gt 0 ]; do
    if curl -f http://localhost:3000 >/dev/null 2>&1; then
        print_info "✅ Frontend started successfully"
        break
    fi
    echo "Waiting for frontend... ($timeout seconds left)"
    sleep 2
    timeout=$((timeout-2))
done

if [ $timeout -eq 0 ]; then
    print_error "Frontend failed to start"
    cleanup
fi

# Start ngrok for frontend (different port for API)
print_info "Starting ngrok for frontend..."
nohup ngrok http 3000 --web-addr=localhost:4041 --log=stdout > ngrok-frontend.log 2>&1 &
sleep 5

# Get frontend URL
FRONTEND_URL=$(curl -s http://localhost:4041/api/tunnels | jq -r '.tunnels[0].public_url')
if [ "$FRONTEND_URL" = "null" ] || [ -z "$FRONTEND_URL" ]; then
    print_error "Failed to get frontend ngrok URL"
    cleanup
fi

print_info "✅ Frontend exposed at: $FRONTEND_URL"

print_header "🎉 Demo Ready!"
echo ""
echo "🌐 Frontend: $FRONTEND_URL"
echo "🔧 Backend:  $BACKEND_URL"
echo ""
echo "📊 Local URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8080"
echo "   Database: localhost:5432"
echo ""
echo "🔍 Ngrok Dashboards:"
echo "   Backend:  http://localhost:4040"
echo "   Frontend: http://localhost:4041"
echo ""

print_info "✨ Test your APIs:"
echo "curl $BACKEND_URL/actuator/health"
echo "curl $BACKEND_URL/api/rules"
echo ""

print_info "📝 Logs:"
echo "Backend:  tail -f backend.log"
echo "Frontend: tail -f frontend.log"
echo "Ngrok BE: tail -f ngrok-backend.log"
echo "Ngrok FE: tail -f ngrok-frontend.log"
echo ""

print_warn "Press Ctrl+C to stop all services"

# Keep running until interrupted
while true; do
    sleep 10
    
    # Check if services are still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        print_error "Backend process died"
        cleanup
    fi
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        print_error "Frontend process died"
        cleanup
    fi
done