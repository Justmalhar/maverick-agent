FROM node:20-slim

WORKDIR /app

# System deps: curl for CLI installs, git for agent tools, ca-certificates for HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install npm dependencies first (best cache layer)
COPY package*.json ./
RUN npm install --production

# Install Claude Code CLI via npm (avoids OOM from native installer)
RUN npm install -g @anthropic-ai/claude-code

# Install Opencode CLI
RUN curl -fsSL https://opencode.ai/install | bash

COPY . .

# Create non-root user (Claude Code refuses bypassPermissions as root)
RUN useradd -m -s /bin/bash maverick && chown -R maverick:maverick /app

# Set up paths and workspace for the non-root user
ENV PATH="/home/maverick/.opencode/bin:/home/maverick/.local/bin:${PATH}"
ENV HOME=/home/maverick

# Move opencode CLI to the new user's path
RUN cp -r /root/.opencode /home/maverick/.opencode 2>/dev/null || true && \
    chown -R maverick:maverick /home/maverick

# Create workspace and Claude config as the non-root user
USER maverick
RUN mkdir -p /home/maverick/maverick-agent/Memory && \
    mkdir -p /home/maverick/.claude && \
    echo '{}' > /home/maverick/.claude/statsig_metadata.json && \
    echo '{"hasCompletedOnboarding":true}' > /home/maverick/.claude/settings.json

EXPOSE 4096

CMD ["node", "gateway.js"]