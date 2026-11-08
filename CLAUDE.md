# Claude Code

Follow [`AGENTS.md`](AGENTS.md) as the repository authority. Use Claude-specific tools only as execution helpers; they do not change the repository boundaries, validation requirements, secret handling, or explicit authorization required for remote writes.

## Branch authorization

The repository owner gives standing permission for Claude sessions, including
cloud sessions assigned a `claude/*` branch, to work on `main` and push to it
directly. A push to `main` deploys production through GitHub Actions, so the
`AGENTS.md` validation rules apply before every push. Open a pull request only
when a check runs solely on pull requests (such as the E2E job) or the owner
asks for one.
