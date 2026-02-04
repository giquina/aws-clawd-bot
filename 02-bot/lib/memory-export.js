/**
 * Memory Export Utility
 * Generates MEMORY.md from SQLite database for context caching
 * Used by OpenClaw Executive Assistant spec
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate MEMORY.md content from database
 * @param {Object} db - Memory manager instance
 * @param {string} userId - User ID to export for
 * @returns {string} Markdown content
 */
function generateMemoryMd(db, userId) {
    const now = new Date().toISOString();

    let content = `# MEMORY.md - ClawdBot Context Cache\n\n`;
    content += `> Auto-generated: ${now}\n`;
    content += `> User: ${userId || 'default'}\n\n`;
    content += `---\n\n`;

    try {
        // Section 1: Known Facts
        content += `## Known Facts\n\n`;
        content += generateFactsSection(db, userId);

        // Section 2: Active Projects
        content += `## Active Projects\n\n`;
        content += generateProjectsSection(db, userId);

        // Section 3: Pending Tasks
        content += `## Pending Tasks\n\n`;
        content += generateTasksSection(db, userId);

        // Section 4: Recent Context
        content += `## Recent Context\n\n`;
        content += generateRecentContext(db, userId);

        // Section 5: User Preferences
        content += `## Preferences\n\n`;
        content += generatePreferencesSection(db, userId);

    } catch (error) {
        content += `\n*Error generating memory: ${error.message}*\n`;
    }

    content += `\n---\n`;
    content += `*End of MEMORY.md*\n`;

    return content;
}

/**
 * Generate facts section
 */
function generateFactsSection(db, userId) {
    let section = '';

    if (!db || !db.getFacts) {
        return `*No facts database available*\n\n`;
    }

    try {
        const facts = db.getFacts(userId) || [];

        if (facts.length === 0) {
            return `*No facts stored yet*\n\n`;
        }

        // Group facts by category
        const byCategory = {};
        facts.forEach(fact => {
            const cat = fact.category || 'general';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(fact);
        });

        for (const [category, catFacts] of Object.entries(byCategory)) {
            section += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
            catFacts.slice(0, 10).forEach(f => {
                section += `- ${f.fact}\n`;
            });
            if (catFacts.length > 10) {
                section += `- ... and ${catFacts.length - 10} more\n`;
            }
            section += `\n`;
        }

    } catch (error) {
        section += `*Error loading facts: ${error.message}*\n\n`;
    }

    return section;
}

/**
 * Generate projects section
 */
function generateProjectsSection(db, userId) {
    let section = '';

    try {
        // Load from project registry if available
        const registryPath = path.join(__dirname, '../../config/project-registry.json');
        if (fs.existsSync(registryPath)) {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            const projects = registry.projects || {};

            const projectList = Object.entries(projects).slice(0, 10);
            if (projectList.length === 0) {
                return `*No projects configured*\n\n`;
            }

            projectList.forEach(([name, info]) => {
                section += `- **${name}**: ${info.description || 'No description'}\n`;
            });

            if (Object.keys(projects).length > 10) {
                section += `- ... and ${Object.keys(projects).length - 10} more\n`;
            }

        } else {
            section += `*Project registry not found*\n`;
        }

    } catch (error) {
        section += `*Error loading projects: ${error.message}*\n`;
    }

    section += `\n`;
    return section;
}

/**
 * Generate tasks section
 */
function generateTasksSection(db, userId) {
    let section = '';

    if (!db || !db.getTasks) {
        return `*No tasks database available*\n\n`;
    }

    try {
        const tasks = db.getTasks(userId, 'pending') || [];

        if (tasks.length === 0) {
            return `*No pending tasks*\n\n`;
        }

        // Group by priority
        const urgent = tasks.filter(t => t.priority === 'urgent');
        const high = tasks.filter(t => t.priority === 'high');
        const other = tasks.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

        if (urgent.length > 0) {
            section += `### Urgent\n`;
            urgent.slice(0, 5).forEach(t => {
                section += `- [ ] ${t.title}\n`;
            });
            section += `\n`;
        }

        if (high.length > 0) {
            section += `### High Priority\n`;
            high.slice(0, 5).forEach(t => {
                section += `- [ ] ${t.title}\n`;
            });
            section += `\n`;
        }

        if (other.length > 0) {
            section += `### Other\n`;
            other.slice(0, 5).forEach(t => {
                section += `- [ ] ${t.title}\n`;
            });
            section += `\n`;
        }

    } catch (error) {
        section += `*Error loading tasks: ${error.message}*\n\n`;
    }

    return section;
}

/**
 * Generate recent context from conversation history
 */
function generateRecentContext(db, userId) {
    let section = '';

    if (!db || !db.getRecentMessages) {
        return `*No conversation history available*\n\n`;
    }

    try {
        const messages = db.getRecentMessages(userId, 5) || [];

        if (messages.length === 0) {
            return `*No recent conversations*\n\n`;
        }

        section += `Last ${messages.length} interactions:\n\n`;
        messages.forEach((msg, i) => {
            const role = msg.role === 'user' ? 'User' : 'Bot';
            const preview = (msg.content || '').substring(0, 100).replace(/\n/g, ' ');
            section += `${i + 1}. **${role}**: ${preview}${msg.content?.length > 100 ? '...' : ''}\n`;
        });

    } catch (error) {
        section += `*Error loading recent context: ${error.message}*\n`;
    }

    section += `\n`;
    return section;
}

/**
 * Generate preferences section
 */
function generatePreferencesSection(db, userId) {
    let section = '';

    // Default preferences (could be stored in facts with category='preference')
    const defaults = {
        'Deep work hours': '9am-12pm, 2pm-5pm',
        'Timezone': 'Europe/London',
        'Morning brief': '7am',
        'Evening summary': '6pm',
        'AI mode': 'balanced'
    };

    // Try to get stored preferences
    if (db && db.getFacts) {
        try {
            const prefs = db.getFacts(userId, 'preference') || [];
            prefs.forEach(p => {
                const key = p.fact.split(':')[0] || p.fact;
                const value = p.fact.split(':')[1]?.trim() || 'set';
                defaults[key] = value;
            });
        } catch (error) {
            // Use defaults
        }
    }

    for (const [key, value] of Object.entries(defaults)) {
        section += `- **${key}**: ${value}\n`;
    }

    section += `\n`;
    return section;
}

/**
 * Write MEMORY.md to file
 * @param {Object} db - Memory manager instance
 * @param {string} userId - User ID
 * @param {string} outputPath - Output file path
 */
function writeMemoryMd(db, userId, outputPath = null) {
    const content = generateMemoryMd(db, userId);
    const filePath = outputPath || path.join(__dirname, '../../MEMORY.md');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[MemoryExport] Written to ${filePath}`);

    return filePath;
}

/**
 * Load MEMORY.md content for AI context
 * @param {string} filePath - Path to MEMORY.md
 * @returns {string|null} Content or null if not found
 */
function loadMemoryMd(filePath = null) {
    const defaultPath = path.join(__dirname, '../../MEMORY.md');
    const targetPath = filePath || defaultPath;

    try {
        if (fs.existsSync(targetPath)) {
            return fs.readFileSync(targetPath, 'utf8');
        }
    } catch (error) {
        console.error('[MemoryExport] Error loading MEMORY.md:', error.message);
    }

    return null;
}

module.exports = {
    generateMemoryMd,
    writeMemoryMd,
    loadMemoryMd,
    generateFactsSection,
    generateProjectsSection,
    generateTasksSection,
    generateRecentContext,
    generatePreferencesSection
};
