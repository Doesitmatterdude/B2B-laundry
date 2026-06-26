#!/usr/bin/env bash
# Provision a fresh GCP Compute Engine VM (Ubuntu 22.04) for FreshFold.
# Run on the VM as a sudo user. SRS Section 25.
set -euo pipefail

echo "==> Installing Docker + Compose"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "==> Installing Node 20 + pnpm (for local tooling/migrations)"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable

echo "==> Clone & boot"
echo "   git clone <your-repo> freshfold && cd freshfold"
echo "   cp apps/api/.env.example apps/api/.env   # then fill secrets (incl. AEROLINK_API_KEY via Secret Manager)"
echo "   docker compose -f infra/docker/compose.yml up -d --build"
echo "   docker compose -f infra/docker/compose.yml exec api pnpm prisma:seed"
echo "==> Done. For TLS: install certbot and issue a cert for your domain, then mount into nginx."
