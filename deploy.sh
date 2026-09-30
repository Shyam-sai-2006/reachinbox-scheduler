#!/usr/bin/env bash
# =============================================================================
# ReachInbox Automated Production Deployment Script
# =============================================================================
set -e

echo "============================================================"
echo "🚀 Starting ReachInbox Production Deployment..."
echo "============================================================"

# Check Docker installation
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Ensure Elasticsearch virtual memory limit is met
if [ -w /proc/sys/vm/max_map_count ]; then
    CURRENT_MAP_COUNT=$(cat /proc/sys/vm/max_map_count)
    if [ "$CURRENT_MAP_COUNT" -lt 262144 ]; then
        echo "⚙️ Setting vm.max_map_count=262144 for Elasticsearch..."
        sysctl -w vm.max_map_count=262144 || true
    fi
fi

# Prepare production environment file
if [ ! -f .env.production ]; then
    echo "📝 Creating .env.production from .env.production.example..."
    cp .env.production.example .env.production
    echo "⚠️ Please review and customize .env.production with your domain and credentials."
fi

# Build and launch all services with docker compose
echo "📦 Building and starting production containers..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo "============================================================"
echo "⏳ Waiting for services to become healthy..."
echo "============================================================"

sleep 10
docker compose -f docker-compose.prod.yml ps

echo ""
echo "============================================================"
echo "✅ ReachInbox is successfully deployed!"
echo "============================================================"
echo "🌐 Web Dashboard: http://localhost (or your server's IP / domain)"
echo "📊 Bull Board:   http://localhost/admin/queues"
echo "🩺 API Health:    http://localhost/api/health"
echo "============================================================"
