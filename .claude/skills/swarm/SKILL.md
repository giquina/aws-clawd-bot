# Swarm - Intelligent Parallel Agent Orchestration

**Purpose:** Automatically break down complex tasks into parallel sub-agents and execute them simultaneously.

## Instructions

1. **Analyze the user's request** to understand what needs to be done
2. **Identify independent components** that can be worked on in parallel
3. **Create a breakdown plan** showing:
   - What each agent will do
   - Why they can run in parallel (no dependencies)
   - Success criteria for each agent
4. **Ask for confirmation** showing the plan
5. **Spawn Task agents in parallel** (in a SINGLE message with multiple Task calls)
6. **Coordinate results** once all agents complete
7. **Run final integration tests** if applicable
8. **Report completion** with links to any PRs created

## Agent Breakdown Strategy

For **feature implementation**:
- Agent 1: Core logic/backend
- Agent 2: Frontend/UI components
- Agent 3: Tests
- Agent 4: Documentation
- Agent 5: Configuration/deployment updates

For **bug fixes**:
- Agent 1: Identify root cause + fix
- Agent 2: Add regression tests
- Agent 3: Update related documentation

For **refactoring**:
- Agent 1: File/module 1
- Agent 2: File/module 2
- Agent 3: File/module 3
- Agent 4: Update tests
- Agent 5: Update docs

## Rules

- **Maximum 8 parallel agents** (proven working from insights data)
- Each agent must have **clear boundaries** (specific files/modules)
- Define **success criteria** before spawning
- If agents have dependencies, run in **sequential batches** not all at once
- **Always verify integration** after all agents complete

## Example Usage

User: "Add rate limiting to the API"

You respond:
```
I'll break this into 4 parallel agents:

Agent 1: Implement rate limiting middleware (lib/rate-limiter.js)
Agent 2: Add rate limit configuration (config/rate-limits.json + env vars)
Agent 3: Write tests for rate limiter (tests/rate-limiter.test.js)
Agent 4: Update API documentation with rate limit info

These can run in parallel because they touch different files with no dependencies.

Proceed? (yes/no)
```

User: "yes"

You: [Spawns all 4 Task agents in ONE message, waits for completion, integrates results]

## Success Metrics

- All agents complete successfully
- Integration tests pass
- No merge conflicts
- User gets a final summary with PR links
