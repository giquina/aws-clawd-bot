# Custom Claude Code Skills

This directory contains custom skills for the ClawdBot project.

## Available Skills

### `/status` - Quick Status Check
**What it does:** Reads TODO files, project registry, recent commits, and provides a concise status report.

**When to use:**
- Start of a new session
- Before planning new work
- After switching context

**Example:**
```
You: /status
Claude: [Reads all relevant files and reports what's done, in progress, blocked, and next]
```

---

### `/swarm` - Intelligent Parallel Agent Orchestration
**What it does:** Automatically breaks down complex tasks into parallel sub-agents and executes them simultaneously.

**When to use:**
- Large feature implementations
- Multi-component refactoring
- When you want speed through parallelization

**How it works:**
1. You give a high-level task
2. Claude analyzes and breaks it into independent parts
3. Claude proposes a plan with parallel agents (up to 8)
4. You confirm
5. Claude spawns all agents in parallel (single message)
6. Claude integrates results and reports completion

**Example:**
```
You: /swarm add authentication to the API
Claude: I'll break this into 5 parallel agents:
        - Agent 1: Auth middleware
        - Agent 2: Routes & controllers
        - Agent 3: Tests
        - Agent 4: Documentation
        - Agent 5: Config & env vars
        Proceed?
You: yes
Claude: [Spawns all 5 agents, coordinates, reports completion]
```

**Benefits:**
- 5-8x faster for complex tasks
- Proven working (insights show 6,773 successful Task calls)
- Automatic breakdown - no manual orchestration
- Built-in error handling and integration

---

## Creating New Skills

1. Create a directory: `.claude/skills/your-skill-name/`
2. Add `SKILL.md` with instructions
3. Use with `/your-skill-name`

See [Claude Code Skills docs](https://docs.anthropic.com/claude/docs/custom-skills) for more info.

---

## Configuration

Hooks configured in `.claude/settings.json`:
- `pre-commit`: Runs ESLint before commits
