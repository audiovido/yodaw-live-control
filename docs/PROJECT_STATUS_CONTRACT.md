# YODAW Project Status Contract

Authoritative project status must live at:

`.yodaw/projects/<project-id>.json`

Example:

{
  "schemaVersion": 1,
  "projectId": "codgar",
  "updatedAt": "2026-09-17T00:00:00Z",
  "progress": 92,
  "done": [
    "Backend release audit passed"
  ],
  "doing": [
    "Frontend API integration"
  ],
  "todo": [
    "Production deploy"
  ],
  "blockers": [],
  "guide": "Complete production deployment and run final smoke test."
}

Rules:

- progress must be between 0 and 100
- progress is displayed only when a valid project contract exists
- Git commits are activity evidence, not completion evidence
- seed progress must never appear as verified progress
- workers update this file after meaningful state changes
- updatedAt changes with every meaningful status update
