#!/bin/bash

# Drools UI Docker Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    echo "Drools UI Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start        Start all services (production)"
    echo "  dev          Start development environment (DB + pgAdmin only)"
    echo "  stop         Stop all services"
    echo "  restart      Restart all services"
    echo "  build        Build all Docker images"
    echo "  logs         Show logs from all services"
    echo "  clean        Stop and remove all containers, networks, and volumes"
    echo "  status       Show status of all services"
    echo "  help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start     # Start full application stack"
    echo "  $0 dev       # Start only database for development"
    echo "  $0 logs      # View application logs"
}

# Start production environment
start_production() {
    print_info "Starting Drools UI production environment..."
    docker-compose up -d
    print_info "Services started successfully!"
    print_info "Frontend: http://localhost:3000"
    print_info "Backend: http://localhost:8080"
    print_info "Database: localhost:5432"
}

# Start development environment
start_development() {
    print_info "Starting Drools UI development environment..."
    docker-compose -f docker-compose.dev.yml up -d
    print_info "Development services started successfully!"
    print_info "Database: localhost:5432"
    print_info "pgAdmin: http://localhost:5050 (admin@drools.local / admin)"
    print_warn "Run backend and frontend manually for development:"
    print_warn "  Backend: cd backend && ./gradlew bootRun"
    print_warn "  Frontend: cd frontend && npm run dev"
}

# Stop services
stop_services() {
    print_info "Stopping all services..."
    docker-compose down
    docker-compose -f docker-compose.dev.yml down
    print_info "All services stopped."
}

# Restart services
restart_services() {
    print_info "Restarting services..."
    stop_services
    sleep 2
    start_production
}

# Build images
build_images() {
    print_info "Building Docker images..."
    docker-compose build --no-cache
    print_info "Images built successfully!"
}

# Show logs
show_logs() {
    print_info "Showing logs from all services..."
    docker-compose logs -f
}

# Clean everything
clean_all() {
    print_warn "This will remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cleaning up..."
        docker-compose down -v --remove-orphans
        docker-compose -f docker-compose.dev.yml down -v --remove-orphans
        docker system prune -f
        print_info "Cleanup completed!"
    else
        print_info "Cleanup cancelled."
    fi
}

# Show status
show_status() {
    print_info "Service status:"
    docker-compose ps
    echo ""
    print_info "Development services status:"
    docker-compose -f docker-compose.dev.yml ps
}

# Main script logic
case "${1:-help}" in
    start)
        start_production
        ;;
    dev)
        start_development
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    build)
        build_images
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_all
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac