import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

interface ClaudeHistoryEntry {
  display: string;
  pastedContents: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

interface TranscriptMessage {
  type?: string;
  message?: {
    role: 'user' | 'assistant';
    content: Array<{ type: string; text?: string; [key: string]: unknown }> | string;
  };
  timestamp?: string;
  uuid?: string;
}

export async function POST(request: NextRequest) {
  try {
    const historyPath = path.join(homedir(), '.claude', 'history.jsonl');

    // Read Claude CLI history file
    let historyContent: string;
    try {
      historyContent = readFileSync(historyPath, 'utf-8');
    } catch (err) {
      return NextResponse.json(
        { error: 'Claude CLI history file not found. Make sure you have used Claude CLI before.' },
        { status: 404 }
      );
    }

    // Parse JSONL file
    const lines = historyContent.trim().split('\n').filter(line => line.trim());
    const entries: ClaudeHistoryEntry[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ClaudeHistoryEntry;
        entries.push(entry);
      } catch {
        // Skip invalid lines
      }
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'No valid history entries found' },
        { status: 400 }
      );
    }

    // Group entries by sessionId
    const sessionMap = new Map<string, ClaudeHistoryEntry[]>();
    for (const entry of entries) {
      if (!sessionMap.has(entry.sessionId)) {
        sessionMap.set(entry.sessionId, []);
      }
      sessionMap.get(entry.sessionId)!.push(entry);
    }

    // Import sessions
    let importedCount = 0;
    let messagesImported = 0;
    const errors: string[] = [];
    const db = getDb();

    for (const [sessionId, sessionEntries] of sessionMap.entries()) {
      try {
        // Sort by timestamp
        sessionEntries.sort((a, b) => a.timestamp - b.timestamp);

        const firstEntry = sessionEntries[0];
        const lastEntry = sessionEntries[sessionEntries.length - 1];

        // Create session title from first command
        const title = firstEntry.display.trim().slice(0, 100) || 'Imported Session';

        // Get working directory from project path
        const workingDirectory = firstEntry.project || process.cwd();
        const projectName = path.basename(workingDirectory);

        // Format timestamps to match database format (YYYY-MM-DD HH:MM:SS)
        const createdAt = new Date(firstEntry.timestamp).toISOString().replace('T', ' ').split('.')[0];
        const updatedAt = new Date(lastEntry.timestamp).toISOString().replace('T', ' ').split('.')[0];

        // Check if session already exists
        const existing = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sessionId);
        if (existing) {
          // Session already imported, skip
          continue;
        }

        // Insert session directly into database with original ID and timestamps
        db.prepare(
          'INSERT INTO chat_sessions (id, title, created_at, updated_at, model, system_prompt, working_directory, sdk_session_id, project_name, status, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          sessionId,
          title,
          createdAt,
          updatedAt,
          'claude-sonnet-4-5-20250929', // Default model
          '', // No system prompt
          workingDirectory,
          sessionId, // Use same ID for SDK session
          projectName,
          'active',
          'code' // Default mode
        );

        // Import messages from transcript file
        const transcriptPath = findTranscriptPath(workingDirectory, sessionId);
        if (transcriptPath && existsSync(transcriptPath)) {
          const messageCount = importMessagesFromTranscript(db, sessionId, transcriptPath);
          messagesImported += messageCount;
        }

        importedCount++;
      } catch (err) {
        errors.push(`Failed to import session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported: importedCount,
      total: sessionMap.size,
      messagesImported,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import history' },
      { status: 500 }
    );
  }
}

/**
 * Find the transcript file path for a session
 * Claude CLI stores transcripts in ~/.claude/projects/<encoded-project-path>/<session-id>.jsonl
 */
function findTranscriptPath(workingDirectory: string, sessionId: string): string | null {
  const claudeDir = path.join(homedir(), '.claude', 'projects');
  if (!existsSync(claudeDir)) return null;

  // Encode project path (replace / with -)
  const encodedPath = workingDirectory.replace(/\//g, '-');
  const projectDir = path.join(claudeDir, encodedPath);

  if (!existsSync(projectDir)) return null;

  const transcriptFile = path.join(projectDir, `${sessionId}.jsonl`);
  return existsSync(transcriptFile) ? transcriptFile : null;
}

/**
 * Import messages from a Claude CLI transcript file
 * Returns the number of messages imported
 */
function importMessagesFromTranscript(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  transcriptPath: string
): number {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    let messageCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptMessage;

        // Only import user and assistant messages
        if (entry.type === 'user' || entry.type === 'assistant') {
          if (!entry.message || !entry.message.role) continue;

          const role = entry.message.role;
          let content = '';

          // Extract text content
          if (typeof entry.message.content === 'string') {
            content = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            // Extract text from content blocks
            const textBlocks = entry.message.content
              .filter(block => block.type === 'text' && block.text)
              .map(block => block.text);
            content = textBlocks.join('\n');
          }

          if (!content.trim()) continue;

          // Generate message ID
          const messageId = entry.uuid || crypto.randomBytes(16).toString('hex');

          // Format timestamp
          const timestamp = entry.timestamp
            ? new Date(entry.timestamp).toISOString().replace('T', ' ').split('.')[0]
            : new Date().toISOString().replace('T', ' ').split('.')[0];

          // Insert message
          db.prepare(
            'INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at, token_usage) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(messageId, sessionId, role, content, timestamp, null);

          messageCount++;
        }
      } catch (err) {
        // Skip malformed lines
        console.warn('Failed to parse transcript line:', err);
      }
    }

    return messageCount;
  } catch (err) {
    console.error('Failed to import messages from transcript:', err);
    return 0;
  }
}
