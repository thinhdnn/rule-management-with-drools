#!/bin/bash

###############################################################################
# Multi-Platform Docker Build Script
# Supports: linux/amd64, linux/arm64
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "════════════════════════════════════════════════════════════"
echo "  Multi-Platform Docker Build"
echo "  Platforms: linux/amd64, linux/arm64"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    log_warn "Docker buildx is not available"
    log_info "Installing buildx..."
    docker buildx install
fi

# Create and use builder
log_info "Setting up multi-platform builder..."
docker buildx create --name multiplatform --use 2>/dev/null || docker buildx use multiplatform

# Inspect builder
docker buildx inspect --bootstrap

# Build Backend
log_info "Building backend for multiple platforms..."
cd backend
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t drools-backend:latest \
    --load \
    .
cd ..

log_info "✓ Backend built successfully"

# Build Frontend
log_info "Building frontend for multiple platforms..."
cd frontend
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t drools-frontend:latest \
    --load \
    .
cd ..

log_info "✓ Frontend built successfully"

echo ""
log_info "✅ Multi-platform build completed!"
echo ""
echo "Built images:"
echo "  - drools-backend:latest (amd64, arm64)"
echo "  - drools-frontend:latest (amd64, arm64)"
echo ""
echo "To start services:"
echo "  docker-compose up -d"

