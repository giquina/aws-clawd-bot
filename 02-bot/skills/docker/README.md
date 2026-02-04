# Docker Management Skill

Manage Docker containers on EC2 via Telegram/WhatsApp commands.

## Commands

### List Containers
```
docker ps
docker containers
docker status
```
Lists all Docker containers with their status, ID, name, and image.

### View Container Logs
```
docker logs <container>
```
Shows the last 50 lines of logs for the specified container.

**Example:**
```
docker logs clawd-bot
docker logs nginx
```

### Container Statistics
```
docker stats
```
Displays resource usage (CPU, memory) for all running containers.

### Restart Container
```
docker restart <container>
```
Restarts a Docker container. **Requires confirmation** before execution.

**Example:**
```
docker restart app-server
```

Bot will respond with a confirmation request:
```
confirm docker-abc123
```

To cancel:
```
cancel docker-abc123
```

## Security Features

1. **Command Whitelisting**: Only safe Docker commands are allowed
2. **Confirmation Required**: Destructive operations (restart) require user confirmation
3. **Input Sanitization**: All container names are sanitized to prevent injection
4. **Timeout Protection**: All commands have execution timeouts
5. **Outcome Tracking**: Every action is logged for audit and learning

## Integration

### Outcome Tracker
All Docker operations are tracked in the outcomes table:
- `docker_ps` - List containers
- `docker_logs` - View logs
- `docker_restart` - Restart container
- `docker_stats` - Resource statistics

### Command Whitelist
Docker commands are registered in `lib/command-whitelist.js`:
- `docker ps` - Safe, no confirmation
- `docker logs` - Safe, no confirmation
- `docker stats` - Safe, no confirmation
- `docker restart` - Requires confirmation
- `docker inspect` - Safe, no confirmation

## Platform Support

- **Linux (EC2)**: Full Docker command execution
- **Windows (Dev)**: Simulated responses for testing

## Priority

Priority: **22** (High priority for explicit Docker commands)

## Error Handling

- Connection errors: Checks if Docker daemon is running
- Container not found: Suggests using `docker ps` to list containers
- Timeout errors: Reports timeout duration
- Permission errors: Indicates Docker access issues

## Configuration

Settings in `skills.json`:
```json
"docker": {
  "defaultTimeout": 30000,
  "maxOutputLength": 2500,
  "maxLogLines": 50
}
```

## Future Enhancements

Potential additions:
- `docker stop <container>` - Stop container
- `docker start <container>` - Start container
- `docker exec <container> <command>` - Execute command in container
- `docker compose up/down` - Docker Compose operations
- Health checks and auto-restart on failure
- Container status monitoring with alerts
