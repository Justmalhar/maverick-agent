#!/bin/bash
# ============================================================================
# Maverick Agent Installer
# ============================================================================
# One-line install for Linux, macOS, and WSL2.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/justmalhar/maverick-agent/main/install.sh | bash
#
# Or with options:
#   curl -fsSL ... | bash -s -- --skip-setup
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Configuration
REPO_URL="https://github.com/justmalhar/maverick-agent.git"
MAVERICK_HOME="${MAVERICK_HOME:-$HOME/.maverick}"
INSTALL_DIR=""
INSTALL_DIR_EXPLICIT=false
NODE_VERSION="20"

# Options
RUN_SETUP=true
BRANCH="main"
NON_INTERACTIVE=false

# Detect non-interactive mode
if [ -t 0 ]; then
    IS_INTERACTIVE=true
else
    IS_INTERACTIVE=false
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-setup)
            RUN_SETUP=false
            shift
            ;;
        --branch|-b)
            BRANCH="$2"
            shift 2
            ;;
        --dir)
            INSTALL_DIR="$2"
            INSTALL_DIR_EXPLICIT=true
            shift 2
            ;;
        --maverick-home)
            MAVERICK_HOME="$2"
            shift 2
            ;;
        --non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        -h|--help)
            echo "Maverick Agent Installer"
            echo ""
            echo "Usage: install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-setup       Skip interactive API key configuration"
            echo "  --branch NAME      Git branch to install (default: main)"
            echo "  --dir PATH         Installation directory"
            echo "  --maverick-home    Data directory (default: ~/.maverick)"
            echo "  --non-interactive  Skip prompts (uses defaults)"
            echo "  -h, --help         Show this help"
            echo ""
            echo "Examples:"
            echo "  curl -fsSL https://raw.githubusercontent.com/justmalhar/maverick-agent/main/install.sh | bash"
            echo "  curl -fsSL ... | bash -s -- --skip-setup"
            echo "  curl -fsSL ... | bash -s -- --dir /opt/maverick"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ============================================================================
# Helper functions
# ============================================================================

print_banner() {
    echo ""
    echo -e "${MAGENTA}${BOLD}"
    echo "┌─────────────────────────────────────────────────────────┐"
    echo "│           🤖 Maverick Agent Installer                   │"
    echo "├─────────────────────────────────────────────────────────┤"
    echo "│  Your 24x7 AI assistant on WhatsApp, Telegram & more.   │"
    echo "└─────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
}

log_info() {
    echo -e "${CYAN}→${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

prompt_yes_no() {
    local question="$1"
    local default="${2:-yes}"
    local prompt_suffix
    local answer=""

    case "$default" in
        [yY]|[yY][eE][sS]|[tT][rR][uU][eE]|1) prompt_suffix="[Y/n]" ;;
        *) prompt_suffix="[y/N]" ;;
    esac

    if [ "$NON_INTERACTIVE" = true ]; then
        answer=""
    elif [ "$IS_INTERACTIVE" = true ]; then
        read -r -p "$question $prompt_suffix " answer || answer=""
    elif [ -r /dev/tty ] && [ -w /dev/tty ]; then
        printf "%s %s " "$question $prompt_suffix" > /dev/tty
        IFS= read -r answer < /dev/tty || answer=""
    else
        answer=""
    fi

    answer="${answer#"${answer%%[![:space:]]*}"}"
    answer="${answer%"${answer##*[![:space:]]}"}"

    if [ -z "$answer" ]; then
        case "$default" in
            [yY]|[yY][eE][sS]|[tT][rR][uU][eE]|1) return 0 ;;
            *) return 1 ;;
        esac
    fi

    case "$answer" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

prompt_input() {
    local question="$1"
    local default="${2:-}"
    local answer=""

    if [ "$NON_INTERACTIVE" = true ]; then
        echo "$default"
        return 0
    fi

    if [ "$IS_INTERACTIVE" = true ]; then
        if [ -n "$default" ]; then
            read -r -p "$question [$default]: " answer || answer=""
        else
            read -r -p "$question: " answer || answer=""
        fi
    elif [ -r /dev/tty ] && [ -w /dev/tty ]; then
        if [ -n "$default" ]; then
            printf "%s [%s]: " "$question" "$default" > /dev/tty
        else
            printf "%s: " "$question" > /dev/tty
        fi
        IFS= read -r answer < /dev/tty || answer=""
    fi

    echo "${answer:-$default}"
}

# Portable .env setter — works on macOS (BSD sed) and Linux (GNU sed)
set_env_var() {
    local file="$1"
    local key="$2"
    local value="$3"

    if grep -q "^${key}=" "$file" 2>/dev/null; then
        # Variable exists — replace it
        local tmp="${file}.tmp"
        grep -v "^${key}=" "$file" > "$tmp" 2>/dev/null || true
        echo "${key}=${value}" >> "$tmp"
        mv "$tmp" "$file"
    else
        # Variable doesn't exist — append it
        echo "${key}=${value}" >> "$file"
    fi
}

# ============================================================================
# System detection
# ============================================================================

detect_os() {
    case "$(uname -s)" in
        Linux*)
            OS="linux"
            if [ -f /etc/os-release ]; then
                . /etc/os-release
                DISTRO="$ID"
            else
                DISTRO="unknown"
            fi
            ;;
        Darwin*)
            OS="macos"
            DISTRO="macos"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            DISTRO="windows"
            log_error "Windows detected. Please use WSL2 or install manually."
            log_info "  wsl --install"
            log_info "  Then re-run this installer inside WSL2."
            exit 1
            ;;
        *)
            OS="unknown"
            DISTRO="unknown"
            log_warn "Unknown operating system"
            ;;
    esac

    log_success "Detected: $OS ($DISTRO)"
}

# ============================================================================
# Dependency checks
# ============================================================================

check_git() {
    log_info "Checking Git..."

    if command -v git &> /dev/null && git --version &> /dev/null; then
        GIT_VERSION=$(git --version | awk '{print $3}')
        log_success "Git $GIT_VERSION found"
        return 0
    fi

    log_error "Git not found"

    case "$OS" in
        macos)
            if command -v brew &> /dev/null; then
                log_info "Installing Git via Homebrew..."
                brew install git >/dev/null 2>&1
                log_success "Git installed"
                return 0
            fi
            log_info "Install Git: xcode-select --install"
            ;;
        linux)
            case "$DISTRO" in
                ubuntu|debian)
                    log_info "Install Git: sudo apt update && sudo apt install git"
                    ;;
                fedora)
                    log_info "Install Git: sudo dnf install git"
                    ;;
                arch)
                    log_info "Install Git: sudo pacman -S git"
                    ;;
            esac
            ;;
    esac
    exit 1
}

check_node() {
    log_info "Checking Node.js (need v${NODE_VERSION}+)..."

    if command -v node &> /dev/null; then
        local node_ver
        node_ver=$(node --version | sed 's/v//')
        local major
        major=$(echo "$node_ver" | cut -d. -f1)

        if [ "$major" -ge "$NODE_VERSION" ]; then
            log_success "Node.js v$node_ver found"
            HAS_NODE=true
            return 0
        else
            log_warn "Node.js v$node_ver is too old (need v${NODE_VERSION}+)"
        fi
    else
        log_info "Node.js not found"
    fi

    # Install Node.js
    install_node
}

install_node() {
    log_info "Installing Node.js $NODE_VERSION LTS..."

    case "$OS" in
        macos)
            if command -v brew &> /dev/null; then
                log_info "Installing via Homebrew..."
                brew install node@$NODE_VERSION >/dev/null 2>&1 || brew install node >/dev/null 2>&1
                if command -v node &> /dev/null; then
                    log_success "Node.js $(node --version) installed"
                    HAS_NODE=true
                    return 0
                fi
            fi
            ;;
        linux)
            local sudo_cmd=""
            if [ "$(id -u)" -ne 0 ]; then
                command -v sudo &> /dev/null && sudo_cmd="sudo"
            fi

            # Try NodeSource
            if command -v curl &> /dev/null; then
                log_info "Installing via NodeSource..."
                curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | $sudo_cmd bash - 2>/dev/null || true
                case "$DISTRO" in
                    ubuntu|debian)
                        $sudo_cmd apt-get install -y nodejs >/dev/null 2>&1 || true
                        ;;
                    fedora)
                        $sudo_cmd dnf install -y nodejs >/dev/null 2>&1 || true
                        ;;
                    arch)
                        $sudo_cmd pacman -S --noconfirm nodejs npm >/dev/null 2>&1 || true
                        ;;
                esac
            fi
            ;;
    esac

    if command -v node &> /dev/null; then
        log_success "Node.js $(node --version) installed"
        HAS_NODE=true
    else
        log_error "Failed to install Node.js"
        log_info "Install manually: https://nodejs.org/en/download/"
        log_info "  Then re-run this installer."
        exit 1
    fi
}

install_claude_code() {
    log_info "Checking Claude Code CLI..."

    if command -v claude &> /dev/null; then
        log_success "Claude Code found"
        return 0
    fi

    log_info "Claude Code not found"
    if prompt_yes_no "Install Claude Code CLI? (recommended)" "yes"; then
        log_info "Installing Claude Code..."
        if npm install -g @anthropic-ai/claude-code 2>/dev/null; then
            log_success "Claude Code installed"
        else
            log_warn "Claude Code install failed — you can install later: npm install -g @anthropic-ai/claude-code"
        fi
    else
        log_info "Skipping Claude Code. Install later: npm install -g @anthropic-ai/claude-code"
    fi
}

# ============================================================================
# Installation
# ============================================================================

resolve_install_dir() {
    if [ "$INSTALL_DIR_EXPLICIT" = true ]; then
        log_info "Install directory: $INSTALL_DIR (explicit)"
        return 0
    fi

    INSTALL_DIR="$MAVERICK_HOME/maverick-agent"
}

clone_repo() {
    log_info "Installing to $INSTALL_DIR..."

    if [ -d "$INSTALL_DIR" ]; then
        if [ -d "$INSTALL_DIR/.git" ]; then
            log_info "Existing installation found, updating..."
            cd "$INSTALL_DIR"

            if [ -n "$(git status --porcelain)" ]; then
                log_info "Local changes detected, stashing..."
                git stash push --include-untracked -m "maverick-install-autostash-$(date -u +%Y%m%d-%H%M%S)" 2>/dev/null || true
            fi

            git fetch origin "$BRANCH"
            git checkout "$BRANCH"
            git pull --ff-only origin "$BRANCH"
            log_success "Updated to latest"
        else
            log_error "Directory exists but is not a git repository: $INSTALL_DIR"
            log_info "Remove it or choose a different directory with --dir"
            exit 1
        fi
    else
        log_info "Cloning repository..."
        if git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"; then
            log_success "Repository cloned"
        else
            log_error "Failed to clone repository"
            exit 1
        fi
    fi

    cd "$INSTALL_DIR"
}

install_deps() {
    log_info "Installing dependencies..."
    npm install --production 2>/dev/null || npm install
    log_success "Dependencies installed"
}

setup_path() {
    log_info "Setting up maverick command..."

    local command_link_dir="$HOME/.local/bin"
    mkdir -p "$command_link_dir"

    # Create launcher script
    rm -f "$command_link_dir/maverick"
    cat > "$command_link_dir/maverick" <<EOF
#!/usr/bin/env bash
exec node "$INSTALL_DIR/cli.js" "\$@"
EOF
    chmod +x "$command_link_dir/maverick"

    # Check if on PATH
    if ! echo "$PATH" | tr ':' '\n' | grep -q "^$command_link_dir$"; then
        SHELL_CONFIGS=()
        LOGIN_SHELL="$(basename "${SHELL:-/bin/bash}")"

        case "$LOGIN_SHELL" in
            zsh)
                [ -f "$HOME/.zshrc" ] && SHELL_CONFIGS+=("$HOME/.zshrc")
                [ -f "$HOME/.zprofile" ] && SHELL_CONFIGS+=("$HOME/.zprofile")
                if [ ${#SHELL_CONFIGS[@]} -eq 0 ]; then
                    touch "$HOME/.zshrc"
                    SHELL_CONFIGS+=("$HOME/.zshrc")
                fi
                ;;
            bash)
                [ -f "$HOME/.bashrc" ] && SHELL_CONFIGS+=("$HOME/.bashrc")
                [ -f "$HOME/.bash_profile" ] && SHELL_CONFIGS+=("$HOME/.bash_profile")
                ;;
            fish)
                local fish_config="$HOME/.config/fish/config.fish"
                mkdir -p "$(dirname "$fish_config")"
                touch "$fish_config"
                if ! grep -q 'fish_add_path.*\.local/bin' "$fish_config" 2>/dev/null; then
                    echo "" >> "$fish_config"
                    echo "# Maverick Agent" >> "$fish_config"
                    echo 'fish_add_path "$HOME/.local/bin"' >> "$fish_config"
                    log_success "Added ~/.local/bin to fish PATH"
                fi
                ;;
            *)
                [ -f "$HOME/.bashrc" ] && SHELL_CONFIGS+=("$HOME/.bashrc")
                [ -f "$HOME/.zshrc" ] && SHELL_CONFIGS+=("$HOME/.zshrc")
                ;;
        esac

        PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
        for SHELL_CONFIG in "${SHELL_CONFIGS[@]}"; do
            if [ -f "$SHELL_CONFIG" ] && ! grep -v '^[[:space:]]*#' "$SHELL_CONFIG" 2>/dev/null | grep -qE 'PATH=.*\.local/bin'; then
                echo "" >> "$SHELL_CONFIG"
                echo "# Maverick Agent" >> "$SHELL_CONFIG"
                echo "$PATH_LINE" >> "$SHELL_CONFIG"
                log_success "Added ~/.local/bin to PATH in $SHELL_CONFIG"
            fi
        done
    fi

    export PATH="$command_link_dir:$PATH"
    log_success "maverick command ready"
}

copy_config() {
    log_info "Setting up configuration..."

    mkdir -p "$MAVERICK_HOME"

    # Create .env from template
    if [ ! -f "$MAVERICK_HOME/.env" ]; then
        if [ -f "$INSTALL_DIR/.env.example" ]; then
            cp "$INSTALL_DIR/.env.example" "$MAVERICK_HOME/.env"
            chmod 600 "$MAVERICK_HOME/.env"
            log_success "Created $MAVERICK_HOME/.env"
        else
            touch "$MAVERICK_HOME/.env"
            chmod 600 "$MAVERICK_HOME/.env"
        fi
    else
        log_info ".env already exists, keeping it"
    fi

    # Create workspace directories
    mkdir -p "$MAVERICK_HOME/Memory"
    mkdir -p "$MAVERICK_HOME/Sessions"

    log_success "Configuration directory ready: $MAVERICK_HOME/"
}

run_setup_wizard() {
    if [ "$RUN_SETUP" = false ]; then
        log_info "Skipping setup wizard (--skip-setup)"
        return 0
    fi

    if ! (: </dev/tty) 2>/dev/null; then
        log_info "No terminal available. Run 'maverick setup' after install."
        return 0
    fi

    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  Setup Wizard — Configure your AI assistant${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    local env_file="$MAVERICK_HOME/.env"

    # --- Anthropic API Key ---
    echo -e "${YELLOW}Step 1: Anthropic API Key${NC}"
    echo "  Get your key from https://console.anthropic.com/"
    echo ""
    local anthropic_key
    anthropic_key=$(prompt_input "Enter your Anthropic API key" "")
    if [ -n "$anthropic_key" ]; then
        set_env_var "$env_file" "ANTHROPIC_API_KEY" "$anthropic_key"
        log_success "Anthropic API key saved"
    else
        log_warn "No API key provided. Set ANTHROPIC_API_KEY in $env_file later."
    fi
    echo ""

    # --- Provider selection ---
    echo -e "${YELLOW}Step 2: AI Provider${NC}"
    echo "  1) Claude (recommended) — requires Claude Code CLI"
    echo "  2) Opencode — open-source alternative"
    echo ""
    local provider_choice
    provider_choice=$(prompt_input "Choose provider" "1")
    echo ""

    # --- Messaging Platform ---
    echo -e "${YELLOW}Step 3: Messaging Platform${NC}"
    echo "  1) WhatsApp (QR code scan)"
    echo "  2) Telegram (bot token)"
    echo "  3) iMessage (macOS only)"
    echo "  4) Skip (configure later)"
    echo ""
    local msg_choice
    msg_choice=$(prompt_input "Choose messaging platform" "1")

    case "$msg_choice" in
        1)
            echo ""
            echo "  WhatsApp Setup:"
            echo "  - You'll scan a QR code when the gateway starts"
            echo "  - Allowed phone numbers (comma-separated, or * for all):"
            local wa_dms
            wa_dms=$(prompt_input "Allowed WhatsApp DMs" "*")
            set_env_var "$env_file" "WHATSAPP_ALLOWED_DMS" "$wa_dms"
            log_success "WhatsApp configured"
            ;;
        2)
            echo ""
            echo "  Telegram Setup:"
            echo "  - Message @BotFather on Telegram, send /newbot, copy the token"
            local tg_token
            tg_token=$(prompt_input "Enter Telegram bot token" "")
            if [ -n "$tg_token" ]; then
                set_env_var "$env_file" "TELEGRAM_BOT_TOKEN" "$tg_token"
                log_success "Telegram configured"
            fi
            ;;
        3)
            echo ""
            if [ "$OS" = "macos" ]; then
                echo "  iMessage requires the 'imsg' CLI tool."
                if ! command -v imsg &> /dev/null; then
                    if prompt_yes_no "Install imsg via Homebrew?" "yes"; then
                        if command -v brew &> /dev/null; then
                            brew install steipete/formulae/imsg
                            log_success "imsg installed"
                        else
                            log_warn "Homebrew not found. Install manually: brew install steipete/formulae/imsg"
                        fi
                    fi
                fi
                local im_dms
                im_dms=$(prompt_input "Allowed iMessage DMs" "*")
                set_env_var "$env_file" "IMESSAGE_ALLOWED_DMS" "$im_dms"
                log_success "iMessage configured"
            else
                log_warn "iMessage is macOS only."
            fi
            ;;
        4)
            log_info "Skipping messaging setup. Configure later in $env_file"
            ;;
    esac
    echo ""

    # --- GitHub ---
    echo -e "${YELLOW}Step 4: GitHub Integration (optional)${NC}"
    if prompt_yes_no "Configure GitHub integration?" "no"; then
        echo "  Create a token: GitHub Settings > Developer settings > Personal access tokens"
        echo "  Permissions needed: repo, workflow, read:org"
        local github_pat
        github_pat=$(prompt_input "Enter GitHub Personal Access Token" "")
        if [ -n "$github_pat" ]; then
            set_env_var "$env_file" "GITHUB_PAT" "$github_pat"
            log_success "GitHub configured"
        fi
    fi
    echo ""

    # --- Voice ---
    echo -e "${YELLOW}Step 5: Voice / TTS / STT (optional)${NC}"
    if prompt_yes_no "Configure voice features?" "no"; then
        echo "  TTS providers: elevenlabs, fal, replicate, openai"
        local tts_provider
        tts_provider=$(prompt_input "TTS provider" "elevenlabs")
        set_env_var "$env_file" "TTS_PROVIDER" "$tts_provider"

        echo "  STT providers: groq, fal, replicate, openai"
        local stt_provider
        stt_provider=$(prompt_input "STT provider" "groq")
        set_env_var "$env_file" "STT_PROVIDER" "$stt_provider"
        log_success "Voice configured"
    fi
    echo ""

    echo -e "${GREEN}${BOLD}Setup complete!${NC}"
    echo ""
}

maybe_start_gateway() {
    if [ "$RUN_SETUP" = false ]; then
        return 0
    fi

    if ! (: </dev/tty) 2>/dev/null; then
        return 0
    fi

    echo ""
    if prompt_yes_no "Start the messaging gateway now?" "yes"; then
        echo ""
        echo -e "${CYAN}Starting gateway...${NC}"
        echo "  (Press Ctrl+C to stop)"
        echo ""

        if [ "$OS" = "macos" ] || command -v systemctl &> /dev/null; then
            if prompt_yes_no "Run gateway in background as a service?" "yes"; then
                nohup node "$INSTALL_DIR/gateway.js" > "$MAVERICK_HOME/gateway.log" 2>&1 &
                GATEWAY_PID=$!
                echo "$GATEWAY_PID" > "$MAVERICK_HOME/gateway.pid"
                log_success "Gateway started in background (PID $GATEWAY_PID)"
                log_info "Logs: $MAVERICK_HOME/gateway.log"
                log_info "Stop: kill $GATEWAY_PID"
            else
                log_info "Run manually: node $INSTALL_DIR/cli.js start"
            fi
        else
            log_info "Run manually: node $INSTALL_DIR/cli.js start"
        fi
    else
        log_info "Start later: maverick start"
    fi
}

print_success() {
    echo ""
    echo -e "${GREEN}${BOLD}"
    echo "┌─────────────────────────────────────────────────────────┐"
    echo "│             ✓ Installation Complete!                    │"
    echo "└─────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
    echo ""

    echo -e "${CYAN}${BOLD}📁 Files:${NC}"
    echo ""
    echo -e "   ${YELLOW}Config:${NC}   $MAVERICK_HOME/.env"
    echo -e "   ${YELLOW}Memory:${NC}   $MAVERICK_HOME/Memory/"
    echo -e "   ${YELLOW}Code:${NC}     $INSTALL_DIR"
    echo ""

    echo -e "${CYAN}─────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${CYAN}${BOLD}🚀 Commands:${NC}"
    echo ""
    echo -e "   ${GREEN}maverick${NC}              Open interactive menu"
    echo -e "   ${GREEN}maverick chat${NC}         Terminal chat"
    echo -e "   ${GREEN}maverick start${NC}        Start messaging gateway"
    echo -e "   ${GREEN}maverick setup${NC}        Re-run setup wizard"
    echo -e "   ${GREEN}maverick config${NC}       Show current config"
    echo ""

    echo -e "${CYAN}─────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${YELLOW}⚡ Reload your shell to use 'maverick' command:${NC}"
    echo ""
    LOGIN_SHELL="$(basename "${SHELL:-/bin/bash}")"
    case "$LOGIN_SHELL" in
        zsh)  echo "   source ~/.zshrc" ;;
        bash) echo "   source ~/.bashrc" ;;
        fish) echo "   source ~/.config/fish/config.fish" ;;
        *)    echo "   source ~/.bashrc   # or ~/.zshrc" ;;
    esac
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_banner

    detect_os
    resolve_install_dir
    check_git
    check_node
    install_claude_code
    clone_repo
    install_deps
    setup_path
    copy_config
    run_setup_wizard
    maybe_start_gateway
    print_success
}

main
