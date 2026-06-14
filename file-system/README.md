# File System

Complete workspace template for `~/maverick-agent/`. Copied on first run.

## Directory Structure

```
~/maverick-agent/
├── SOUL.md, IDENTITY.md, USER.md, TOOLS.md
├── BOOT.md, BOOTSTRAP.md, HEARTBEAT.md
├── Documents/
├── Development/
├── Downloads/
├── Media/ (Images, Audio, Video)
├── Projects/
├── Resources/              # Reference materials, docs, templates
├── Archive/
├── Temp/
├── Memory/
├── Automations/ (Jobs, Logs)
├── Skills/ (15 skills)
├── Tools/
├── Agents/ (12 agents)
└── Chats/
```

## First Run

The `memory/manager.js` copies this structure to `~/maverick-agent/` automatically:
- Creates all directories
- Copies all files (skips existing)
- Creates `.initialized` marker

## Customization

Users can modify files in `~/maverick-agent/` to personalize:
- **SOUL.md** - Change personality traits
- **IDENTITY.md** - Update name or capabilities
- **USER.md** - Add personal context and preferences
