# YODAW Live Control

Modern project-control dashboard for YODAW.

## Live model

Each project can optionally expose:

`.yodaw/status.json`

Example:

```json
{
  "progress": 73,
  "done": ["Task A"],
  "doing": ["Task B"],
  "todo": ["Task C"],
  "blockers": ["Blocker"],
  "guide": "Next action"
}
```

If this file exists, the dashboard uses it as the authoritative project status.
GitHub activity (push, commits, PRs, issues, workflows) is read separately so commit count never fakes completion.

The dashboard is rebuilt and deployed every 5 minutes by GitHub Actions.
