-- ClawdBot Memory System Database Schema
-- SQLite database for conversation history, facts, tasks, and scheduled jobs
-- Created: January 2026

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================================================
-- CONVERSATIONS TABLE
-- Stores all message history between users and the bot
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Index for efficient user history lookups
    CONSTRAINT valid_content CHECK (length(content) > 0)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations(user_id, created_at DESC);

-- ============================================================================
-- FACTS TABLE
-- Stores learned facts about users (preferences, information, context)
-- ============================================================================
CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    fact TEXT NOT NULL,
    source TEXT,  -- Where this fact was learned (e.g., 'user_stated', 'inferred')
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_fact CHECK (length(fact) > 0)
);

CREATE INDEX IF NOT EXISTS idx_facts_user_id ON facts(user_id);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_facts_user_category ON facts(user_id, category);

-- ============================================================================
-- TASKS TABLE
-- Tracks tasks and to-do items for users
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    CONSTRAINT valid_title CHECK (length(title) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

-- ============================================================================
-- SCHEDULED_JOBS TABLE
-- Stores scheduled/recurring job definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    cron_expression TEXT NOT NULL,
    handler TEXT NOT NULL,  -- Function/handler name to execute
    params TEXT,  -- JSON string of parameters
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run DATETIME,
    next_run DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_name CHECK (length(name) > 0),
    CONSTRAINT valid_cron CHECK (length(cron_expression) > 0),
    CONSTRAINT valid_handler CHECK (length(handler) > 0)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_name ON scheduled_jobs(name);

-- ============================================================================
-- TRIGGERS
-- Automatic timestamp updates
-- ============================================================================

-- Update facts.updated_at on modification
CREATE TRIGGER IF NOT EXISTS update_facts_timestamp
AFTER UPDATE ON facts
FOR EACH ROW
BEGIN
    UPDATE facts SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Set tasks.completed_at when status changes to completed
CREATE TRIGGER IF NOT EXISTS set_task_completed_at
AFTER UPDATE OF status ON tasks
FOR EACH ROW
WHEN NEW.status = 'completed' AND OLD.status != 'completed'
BEGIN
    UPDATE tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Clear tasks.completed_at when status changes from completed
CREATE TRIGGER IF NOT EXISTS clear_task_completed_at
AFTER UPDATE OF status ON tasks
FOR EACH ROW
WHEN NEW.status != 'completed' AND OLD.status = 'completed'
BEGIN
    UPDATE tasks SET completed_at = NULL WHERE id = NEW.id;
END;
