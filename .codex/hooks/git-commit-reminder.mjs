#!/usr/bin/env node
// PreToolUse hook: when Claude is about to run `git commit`, inject a reminder
// to first call gitnexus_detect_changes() (per CLAUDE.md project rules).
// Non-blocking: emits additionalContext to the model, exits 0.

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(raw || '{}');
    const cmd = evt?.tool_input?.command ?? '';
    // Match `git commit` (allow `git -C ... commit`, env vars, etc.)
    if (/\bgit\b[^|;&]*\bcommit\b/.test(cmd)) {
      const out = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext:
            'Reminder (CLAUDE.md): before this commit completes, call `gitnexus_detect_changes()` via MCP (or run `npx gitnexus detect-changes`) to verify the changeset affects only the expected symbols and execution flows.',
        },
      };
      process.stdout.write(JSON.stringify(out));
    }
  } catch {
    // Swallow errors — hooks must never break tool execution.
  }
  process.exit(0);
});
