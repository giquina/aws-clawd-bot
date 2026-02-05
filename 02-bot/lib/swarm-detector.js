/**
 * Swarm Detector - Automatic Parallel Agent Orchestration
 *
 * Detects when a task should use parallel agent orchestration
 * and automatically breaks it down into independent sub-agents.
 *
 * Integrated with:
 * - Voice Flow (Telegram voice notes)
 * - Intent Classifier (task understanding)
 * - AI Handler (execution)
 */

class SwarmDetector {
    constructor() {
        this.swarmKeywords = [
            // Feature implementation
            'add', 'create', 'implement', 'build', 'develop',
            // Refactoring
            'refactor', 'migrate', 'update', 'upgrade', 'modernize',
            // Multi-component work
            'comprehensive', 'complete', 'full', 'entire', 'all',
            // Testing
            'test suite', 'comprehensive tests', 'integration tests',
            // Documentation
            'document', 'documentation', 'docs for'
        ];

        this.complexityIndicators = [
            // Multiple components
            'and', 'plus', 'also', 'with', 'including',
            // Multiple files/modules
            'across', 'throughout', 'everywhere', 'all files',
            // System-wide
            'system', 'entire', 'whole', 'complete'
        ];

        this.componentKeywords = [
            'frontend', 'backend', 'api', 'database', 'ui',
            'tests', 'docs', 'documentation', 'config', 'deployment',
            'middleware', 'routes', 'models', 'views', 'controllers'
        ];
    }

    /**
     * Detect if a task should use swarm/parallel agents
     * @param {string} transcript - User's voice command or text
     * @param {Object} context - Additional context (project, history, etc.)
     * @returns {Object} { shouldSwarm: boolean, confidence: number, reason: string, suggestedBreakdown: string[] }
     */
    detectSwarmWorthiness(transcript, context = {}) {
        const lower = transcript.toLowerCase();
        let score = 0;
        let reasons = [];
        let suggestedComponents = [];

        // 1. Check for swarm keywords
        const hasSwarmKeyword = this.swarmKeywords.some(kw => lower.includes(kw));
        if (hasSwarmKeyword) {
            score += 0.3;
            reasons.push('Contains implementation/refactor keywords');
        }

        // 2. Check for complexity indicators
        const complexityCount = this.complexityIndicators.filter(ind => lower.includes(ind)).length;
        if (complexityCount > 0) {
            score += 0.2 * complexityCount;
            reasons.push(`Multiple components indicated (${complexityCount} markers)`);
        }

        // 3. Detect mentioned components
        const mentionedComponents = this.componentKeywords.filter(comp => lower.includes(comp));
        if (mentionedComponents.length >= 2) {
            score += 0.4;
            reasons.push(`Multiple components: ${mentionedComponents.join(', ')}`);
            suggestedComponents = mentionedComponents;
        }

        // 4. Length heuristic - longer commands often need breakdown
        const wordCount = transcript.split(/\s+/).length;
        if (wordCount > 15) {
            score += 0.2;
            reasons.push('Complex/detailed request');
        }

        // 5. Explicit mentions of testing, docs, config together
        const hasTests = lower.includes('test');
        const hasDocs = lower.includes('doc');
        const hasConfig = lower.includes('config');
        const multiConcern = [hasTests, hasDocs, hasConfig].filter(Boolean).length;
        if (multiConcern >= 2) {
            score += 0.3;
            reasons.push('Multiple concerns (implementation + tests/docs/config)');
        }

        // 6. Pattern: "X and Y" or "X with Y"
        if (lower.match(/(\w+)\s+(and|with|plus)\s+(\w+)/)) {
            score += 0.2;
            reasons.push('Compound task detected');
        }

        // Cap score at 1.0
        score = Math.min(score, 1.0);

        // Decision threshold: 0.6 or higher = recommend swarm
        const shouldSwarm = score >= 0.6;

        return {
            shouldSwarm,
            confidence: score,
            reason: reasons.join('; '),
            suggestedComponents: suggestedComponents.length > 0 ? suggestedComponents : this._inferComponents(lower),
            breakdown: shouldSwarm ? this._generateBreakdown(transcript, suggestedComponents) : null
        };
    }

    /**
     * Infer likely components from the task description
     * @private
     */
    _inferComponents(lowerTranscript) {
        const components = [];

        // Common patterns
        if (lowerTranscript.includes('add') || lowerTranscript.includes('create')) {
            components.push('implementation', 'tests', 'documentation');
        }
        if (lowerTranscript.includes('refactor')) {
            components.push('code-changes', 'tests-update', 'documentation-update');
        }
        if (lowerTranscript.includes('fix')) {
            components.push('bug-fix', 'regression-tests');
        }

        return components;
    }

    /**
     * Generate suggested parallel agent breakdown
     * @private
     */
    _generateBreakdown(transcript, mentionedComponents) {
        const suggestions = [];

        // If explicit components mentioned, use those
        if (mentionedComponents.length > 0) {
            mentionedComponents.forEach(comp => {
                suggestions.push(`Agent for ${comp}`);
            });
        }

        // Add standard components if not mentioned
        const lower = transcript.toLowerCase();
        if (!suggestions.some(s => s.includes('test'))) {
            suggestions.push('Agent for tests');
        }
        if (!suggestions.some(s => s.includes('doc')) && lower.length > 30) {
            suggestions.push('Agent for documentation');
        }

        return suggestions.slice(0, 8); // Max 8 agents (proven working)
    }

    /**
     * Generate swarm prompt for AI handler
     * Creates a prompt that instructs Claude to use parallel agents
     * @param {string} originalTranscript - User's original request
     * @param {Object} detection - Detection result from detectSwarmWorthiness
     * @returns {string} Enhanced prompt with swarm instructions
     */
    generateSwarmPrompt(originalTranscript, detection) {
        return `USER REQUEST (via voice/text): "${originalTranscript}"

🔀 PARALLEL AGENT MODE ACTIVATED (Confidence: ${(detection.confidence * 100).toFixed(0)}%)

This task should use PARALLEL AGENT ORCHESTRATION. Follow this process:

1. **Analyze & Break Down:**
   - Identify all independent components that can be worked on simultaneously
   - Suggested components detected: ${detection.suggestedComponents.join(', ')}
   - Look for: implementation, tests, docs, config, frontend, backend, etc.

2. **Propose Plan:**
   - List each parallel agent and what it will do
   - Explain why they can run in parallel (no dependencies)
   - Define success criteria for each agent
   - Maximum 8 agents (proven working)

3. **Execute:**
   - Spawn ALL Task agents in a SINGLE message (multiple <invoke name="Task"> calls)
   - Each agent should target specific files/modules
   - Wait for all agents to complete
   - Coordinate and integrate results

4. **Verify & Report:**
   - Run integration tests if applicable
   - Summarize what each agent completed
   - Report any issues or follow-up needed

IMPORTANT:
- Use the Task tool to spawn parallel agents
- Make tool calls in ONE message for true parallelization
- Each agent must have clear boundaries (specific files/functions)
- Define "done" criteria before spawning

Reason for swarm mode: ${detection.reason}

Now proceed with the parallel agent orchestration.`;
    }
}

// Singleton export
const swarmDetector = new SwarmDetector();

module.exports = {
    swarmDetector,
    SwarmDetector
};
