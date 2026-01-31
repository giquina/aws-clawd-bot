# Memory Skill - Usage Examples

This document provides real-world examples of how users interact with the Memory Skill.

## Example 1: Saving Personal Information

```
User: remember My name is Alex and I'm a full-stack developer
Bot:  ✅ Remembered!
      I'll remember that you: My name is Alex and I'm a full-stack developer
      _Fact #1 saved_

User: remember I work at StartupXYZ
Bot:  ✅ Remembered!
      I'll remember that you: I work at StartupXYZ
      _Fact #2 saved_

User: remember I specialize in React and Node.js
Bot:  ✅ Remembered!
      I'll remember that you: I specialize in React and Node.js
      _Fact #3 saved_
```

## Example 2: Retrieving Stored Facts

```
User: my facts
Bot:  📚 Facts About You
      ━━━━━━━━━━━━━━━━━━━━━

      1. My name is Alex and I'm a full-stack developer
         _2h ago_

      2. I work at StartupXYZ
         _2h ago_

      3. I specialize in React and Node.js
         _1h ago_

      ━━━━━━━━━━━━━━━━━━━━━
      _3 fact(s) stored_

      To forget something: forget <topic>
```

## Example 3: Alternative Phrasing for List

```
User: what do you know about me
Bot:  📚 Facts About You
      ━━━━━━━━━━━━━━━━━━━━━

      1. My name is Alex and I'm a full-stack developer
         _2h ago_

      2. I work at StartupXYZ
         _2h ago_

      3. I specialize in React and Node.js
         _1h ago_

      ━━━━━━━━━━━━━━━━━━━━━
      _3 fact(s) stored_

      To forget something: forget <topic>
```

## Example 4: Forgetting Facts by Topic

```
User: forget StartupXYZ
Bot:  🗑️ Forgotten

      I've deleted 1 fact(s) about "StartupXYZ":

      1. I work at StartupXYZ
```

Then checking what's left:

```
User: my facts
Bot:  📚 Facts About You
      ━━━━━━━━━━━━━━━━━━━━━

      1. My name is Alex and I'm a full-stack developer
         _2h ago_

      2. I specialize in React and Node.js
         _1h ago_

      ━━━━━━━━━━━━━━━━━━━━━
      _2 fact(s) stored_

      To forget something: forget <topic>
```

## Example 5: Forgetting Multiple Facts

Suppose a user has several facts about different projects:

```
User: remember I'm working on project CodeMatrix
Bot:  ✅ Remembered!
      I'll remember that you: I'm working on project CodeMatrix
      _Fact #4 saved_

User: remember CodeMatrix uses microservices architecture
Bot:  ✅ Remembered!
      I'll remember that you: CodeMatrix uses microservices architecture
      _Fact #5 saved_

User: forget CodeMatrix
Bot:  🗑️ Forgotten

      I've deleted 2 fact(s) about "CodeMatrix":

      1. I'm working on project CodeMatrix
      2. CodeMatrix uses microservices architecture
```

## Example 6: Empty Facts List

When a user has no stored facts:

```
User: my facts
Bot:  📝 You haven't shared any facts with me yet.

      Try: remember <something about yourself>
```

## Example 7: Forgetting with No Matches

```
User: forget NonexistentTopic
Bot:  🤔 No facts found about "NonexistentTopic"

      Try: forget <topic>
      Or: my facts (to see all your facts)
```

## Example 8: Clearing Conversation History

```
User: clear memory
Bot:  🧹 Conversation history cleared

      Deleted 47 message(s) from our conversation.

      ⚠️ _This action cannot be undone._

      _Your stored facts remain intact._
```

When history is already empty:

```
User: clear memory
Bot:  💭 Conversation history already empty.

      There's nothing to clear.
```

## Example 9: Complex Fact Scenario

A developer using ClawdBot throughout the day:

```
Morning:
User: remember I'm focusing on bug fixes in the frontend today
Bot:  ✅ Remembered!
      I'll remember that you: I'm focusing on bug fixes in the frontend today
      _Fact #6 saved_

Midday (after some work):
User: what do you know about me
Bot:  📚 Facts About You
      ━━━━━━━━━━━━━━━━━━━━━

      1. My name is Alex and I'm a full-stack developer
         _7h ago_

      2. I specialize in React and Node.js
         _5h ago_

      3. I'm focusing on bug fixes in the frontend today
         _1h ago_

      ━━━━━━━━━━━━━━━━━━━━━
      _3 fact(s) stored_

Evening (project changes):
User: forget frontend
Bot:  🗑️ Forgotten

      I've deleted 1 fact(s) about "frontend":

      1. I'm focusing on bug fixes in the frontend today

User: remember I just shipped a new feature for the mobile app
Bot:  ✅ Remembered!
      I'll remember that you: I just shipped a new feature for the mobile app
      _Fact #7 saved_
```

## Example 10: Using Facts in Context

While the Memory Skill doesn't directly use facts in responses, the MemoryManager integrates with the AI handler to provide context:

```
User: remember I prefer explanations with code examples
Bot:  ✅ Remembered!
      I'll remember that you: I prefer explanations with code examples
      _Fact #8 saved_

[Later in conversation]
User: how do I handle async/await in JavaScript?
Bot:  Based on your preferences, here's an explanation with code:

      Async/await is syntactic sugar for Promises...

      [code example shown]
```

The Memory Skill stores the fact, and the AI handler can retrieve it to personalize responses.

## Example 11: Rapid Fact Entry

Users can save multiple facts in quick succession:

```
User: remember I use VS Code as my IDE
Bot:  ✅ Remembered! [Fact #9]

User: remember I prefer dark mode
Bot:  ✅ Remembered! [Fact #10]

User: remember I use Linux for development
Bot:  ✅ Remembered! [Fact #11]

User: my facts
Bot:  📚 Facts About You
      ━━━━━━━━━━━━━━━━━━━━━
      1. I use VS Code as my IDE
         _just now_
      2. I prefer dark mode
         _45s ago_
      3. I use Linux for development
         _just now_
      [... more facts]
```

## Example 12: Case-Insensitive Search

The forget command is case-insensitive:

```
User: remember I LOVE TypeScript
Bot:  ✅ Remembered! [Fact #12]

User: forget typescript
Bot:  🗑️ Forgotten
      I've deleted 1 fact(s) about "typescript":
      1. I LOVE TypeScript
```

Works the same for:
- `forget TypeScript`
- `forget TYPESCRIPT`
- `forget typescript`

## Integration with Other Skills

While the Memory Skill is standalone, it can work in conjunction with other skills:

1. **Help Skill**: Type `help memory` to see all memory commands
2. **AI Handler**: Uses stored facts in system context for personalized responses
3. **GitHub Skill**: Could potentially use facts about repositories or preferences

## Tips for Users

1. **Be specific**: "I work with Python" is better than "I code"
2. **Use topics as keywords**: Make sure facts contain words you might later search for
3. **Update your facts**: Save new facts about changing preferences or projects
4. **Use clear memory**: Occasionally reset history to keep conversations focused
5. **Combine facts**: Related facts help the AI understand context better

Example good facts:
- "I'm currently learning Rust for systems programming"
- "I prefer stateless, functional programming patterns"
- "I use Docker for all my development environments"
- "I work on microservices at TechCorp"

Example less useful facts:
- "hi"
- "I like code"
- "stuff"
