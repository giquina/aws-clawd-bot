# Memory Skill

The Memory Skill allows ClawdBot users to save and retrieve persistent facts about themselves via WhatsApp. This skill leverages the underlying MemoryManager for SQLite-backed storage.

## Features

- **Save Facts**: Users can tell ClawdBot facts about themselves that persist across conversations
- **List Facts**: Retrieve all stored facts with timestamps
- **Delete Facts**: Remove facts by searching for topic keywords
- **Clear History**: Reset conversation history while keeping stored facts intact

## Commands

### 1. Remember a Fact
```
remember [fact]
```

Saves a fact about the user for future reference.

**Examples:**
- `remember I work as a software engineer at TechCorp`
- `remember I prefer dark mode for IDEs`
- `remember My favorite programming language is TypeScript`

**Response:**
```
✅ Remembered!

I'll remember that you: I work as a software engineer at TechCorp

_Fact #42 saved_
```

### 2. List All Facts
```
my facts
what do you know about me
```

Displays all facts stored for the user with save/update timestamps.

**Response:**
```
📚 Facts About You
━━━━━━━━━━━━━━━━━━━━━

1. I work as a software engineer at TechCorp
   _5d ago_

2. I prefer dark mode for IDEs
   _2h ago_

3. My favorite programming language is TypeScript
   _just now_

━━━━━━━━━━━━━━━━━━━━━
_3 fact(s) stored_

To forget something: forget <topic>
```

### 3. Forget Facts
```
forget [topic]
```

Searches for facts containing the specified topic (case-insensitive) and deletes them.

**Examples:**
- `forget TechCorp` (deletes facts mentioning TechCorp)
- `forget dark mode`

**Response:**
```
🗑️ Forgotten

I've deleted 1 fact(s) about "TechCorp":

1. I work as a software engineer at TechCorp
```

### 4. Clear Memory
```
clear memory
```

Clears the entire conversation history while keeping facts intact. This action cannot be undone.

**Response:**
```
🧹 Conversation history cleared

Deleted 47 message(s) from our conversation.

⚠️ _This action cannot be undone._

_Your stored facts remain intact._
```

## Implementation Details

### Class Structure
- **Extends:** `BaseSkill`
- **Name:** `memory`
- **Priority:** 50 (medium priority, after help but before general AI)

### Dependencies
- `BaseSkill` - Abstract base class for all skills
- `MemoryManager` - SQLite-backed persistent storage (injected via context)

### Data Storage
Facts are stored in the `facts` table of the SQLite database with the following structure:

```sql
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    fact TEXT NOT NULL,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

All facts use:
- `category`: 'general'
- `source`: 'user_stated'

## Integration

### How It's Loaded
The Memory Skill is automatically loaded by the Skill Loader when `memory` is listed in the `enabled` array in `skills.json`:

```json
{
  "enabled": ["help", "memory", "github"]
}
```

### Receiving Context
When the skill executes, it receives context with:
```javascript
{
  from: '+447123456789',        // User phone number (becomes userId)
  messageId: 'unique-id',
  timestamp: Date,
  // ... other context fields
}
```

### Memory Manager API Used
```javascript
// Save a fact
memory.saveFact(userId, fact, category, source)

// Get facts
memory.getFacts(userId, category)

// Delete a fact
memory.deleteFact(userId, factId)

// Clear conversation history
memory.clearHistory(userId)

// Get conversation history
memory.getConversationHistory(userId, limit)
```

## Response Formatting

All responses use WhatsApp-friendly formatting:
- **Bold text**: `*text*`
- **Italics**: `_text_`
- **Emoji**: Used to indicate command type (✅, 📚, 🗑️, 🧹, 🤔)
- **Separators**: `━━━━━━━━━━━━━━━━━━━━━`
- **Numbered lists**: For fact listings
- **Indentation**: For metadata (timestamps, fact counts)

## Error Handling

The skill handles common error cases gracefully:

- **No facts stored**: Suggests the `remember` command
- **No matching facts for forget**: Provides helpful suggestions
- **Empty input**: Polite requests for required information
- **Database errors**: Generic user-friendly error messages with logging

## Logging

All operations are logged with the skill's logger:
```
[Skill:memory] Saved fact for user +447123456789: I work as a software engineer
[Skill:memory] Retrieved 3 facts for user +447123456789
[Skill:memory] Deleted 1 facts for user +447123456789
[Skill:memory] Cleared 47 messages for user +447123456789
```

## Performance

- **Facts retrieval**: O(n) where n = number of facts for user
- **Fact deletion**: O(m) where m = matching facts found
- **History clearing**: Single database transaction
- **Date formatting**: Client-side calculation (no DB query)

## Security

- Facts are **user-scoped**: Users can only access their own facts via `from` phone number
- **Database isolation**: SQLite with foreign key constraints
- **Prepared statements**: Used throughout to prevent SQL injection
- **Input validation**: All user input is trimmed and validated

## Future Enhancements

Potential improvements for the Memory Skill:

1. **Fact categories**: Allow users to specify custom categories (work, personal, preferences)
2. **Fact updates**: Overwrite facts instead of duplicating
3. **Search within facts**: Find facts by keyword
4. **Fact statistics**: Show how many facts per category
5. **Two-step confirmation**: For destructive operations (clear memory)
6. **Export facts**: Allow users to export their facts
7. **Fact reminders**: Periodic notifications about stored facts
8. **Importance levels**: Star/favorite facts for quick reference

## Examples of Typical Usage

```
User: remember I'm learning Rust right now
Bot: ✅ Remembered!
     I'll remember that you: I'm learning Rust right now
     _Fact #1 saved_

User: remember My main projects are in Python
Bot: ✅ Remembered!
     I'll remember that you: My main projects are in Python
     _Fact #2 saved_

User: my facts
Bot: 📚 Facts About You
     ━━━━━━━━━━━━━━━━━━━━━
     1. I'm learning Rust right now
        _just now_
     2. My main projects are in Python
        _2m ago_
     ━━━━━━━━━━━━━━━━━━━━━
     _2 fact(s) stored_

User: forget Python
Bot: 🗑️ Forgotten
     I've deleted 1 fact(s) about "Python":
     1. My main projects are in Python
```

## File Structure

```
02-whatsapp-bot/skills/memory/
├── index.js          # Memory Skill implementation
└── README.md         # This file
```

## Related Files

- `/02-whatsapp-bot/memory/memory-manager.js` - SQLite-backed memory storage
- `/02-whatsapp-bot/skills/base-skill.js` - Base class all skills extend
- `/02-whatsapp-bot/skills/skills.json` - Skill configuration and enablement
