/**
 * Task Queue for long-running operations
 * Manages Claude Code sessions and other async tasks
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class TaskQueue {
  constructor() {
    this.queue = [];  // Tasks waiting to start
    this.running = new Map();  // sessionId → { task, process, startTime }
    this.maxConcurrent = 1;  // Only 1 Claude Code session at a time
  }

  /**
   * Add task to queue
   * @returns {string} taskId
   */
  async addTask(type, params, context) {
    const taskId = this.generateId();
    const task = {
      id: taskId,
      type,
      params,
      context,
      status: 'queued',
      createdAt: Date.now()
    };

    this.queue.push(task);
    console.log(`[TaskQueue] Added ${type} task ${taskId} to queue`);

    // Start processing immediately
    this.processNext();

    return taskId;
  }

  /**
   * Process next queued task if capacity available
   */
  async processNext() {
    if (this.running.size >= this.maxConcurrent) {
      console.log('[TaskQueue] At max capacity, waiting...');
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    console.log(`[TaskQueue] Starting task ${task.id} (${task.type})`);

    this.running.set(task.id, { task, startTime: Date.now() });

    try {
      await this.executeTask(task);
    } catch (err) {
      console.error(`[TaskQueue] Task ${task.id} failed:`, err.message);
      task.status = 'failed';
      task.error = err.message;
    } finally {
      this.running.delete(task.id);
      console.log(`[TaskQueue] Task ${task.id} completed, checking queue...`);
      this.processNext();  // Process next task
    }
  }

  /**
   * Execute a task based on type
   */
  async executeTask(task) {
    switch (task.type) {
      case 'claude_code_session':
        return await this.executeClaudeCode(task);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  /**
   * Execute Claude Code session
   */
  async executeClaudeCode(task) {
    const { sessionId, repo, task: taskDesc, repoPath, logPath } = task.params;
    const { sendProgress } = task.context;

    // Spawn Claude Code process
    const logFile = await fs.open(logPath, 'w');

    const process = spawn('claude-code', [
      '--task', taskDesc,
      '--repo', repoPath,
      '--max-iterations', '50'
    ], {
      detached: true,
      stdio: ['ignore', logFile.fd, logFile.fd]
    });

    console.log(`[TaskQueue] Claude Code session ${sessionId} started (PID: ${process.pid})`);

    // Update running map with process handle
    const running = this.running.get(task.id);
    if (running) {
      running.process = process;
      running.pid = process.pid;
    }

    // Monitor process
    await this.monitorProcess(process, sessionId, logPath, sendProgress);

    await logFile.close();
  }

  /**
   * Monitor process until completion
   */
  async monitorProcess(process, sessionId, logPath, sendProgress) {
    return new Promise((resolve, reject) => {
      process.on('exit', (code) => {
        console.log(`[TaskQueue] Process exited with code ${code}`);
        resolve(code);
      });

      process.on('error', (err) => {
        console.error(`[TaskQueue] Process error:`, err);
        reject(err);
      });
    });
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId) {
    const running = this.running.get(taskId);

    if (!running) {
      // Check if it's queued
      const queueIndex = this.queue.findIndex(t => t.id === taskId);
      if (queueIndex >= 0) {
        this.queue.splice(queueIndex, 1);
        console.log(`[TaskQueue] Cancelled queued task ${taskId}`);
        return true;
      }
      return false;
    }

    // Send SIGTERM first (graceful)
    if (running.process && running.pid) {
      try {
        process.kill(running.pid, 'SIGTERM');
        await this.sleep(5000);

        // Force kill if still running
        if (this.isProcessAlive(running.pid)) {
          process.kill(running.pid, 'SIGKILL');
        }

        console.log(`[TaskQueue] Killed process ${running.pid}`);
      } catch (err) {
        console.error(`[TaskQueue] Error killing process:`, err.message);
      }
    }

    this.running.delete(taskId);
    return true;
  }

  /**
   * Check if process is still alive
   */
  isProcessAlive(pid) {
    try {
      process.kill(pid, 0);  // Signal 0 checks if process exists
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      capacity: this.maxConcurrent
    };
  }

  generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new TaskQueue();  // Singleton
