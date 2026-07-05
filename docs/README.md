# AgenticBEAR — Documentation

Two shelves: **architecture** (how the system works) and **operations** (how to
run it). Start with the overview, or jump straight to the runbook.

## Architecture — how it works

| Doc | What's in it |
|---|---|
| [architecture/overview.md](architecture/overview.md) | The big picture: three faces (Agentic / Gateway / Cost) over one provider core, entry paths, persistence |
| [architecture/agents.md](architecture/agents.md) | Agent model, orchestrator vs specialist, run engine, chat, the tool-use loop, MCP |
| [architecture/gateway.md](architecture/gateway.md) | OpenAI-compatible endpoint: model addressing, API keys, scopes, streaming, usage tracking |
| [architecture/cost-optimization.md](architecture/cost-optimization.md) | The five cost layers (L0 compression → L4 output-min), gateway vs agentic paths, dashboards *(Türkçe)* |
| [architecture/backend.md](architecture/backend.md) | Server deep-dive: folder map, services, engine, DB schema, endpoints *(Türkçe)* |
| [architecture/database.md](architecture/database.md) | Dual-driver data layer: SQLite default, Postgres via `DATABASE_URL`, migration script, dialect notes *(Türkçe)* |

## Operations — how to run it

| Doc | What's in it |
|---|---|
| [operations/deployment.md](operations/deployment.md) | Docker-compose test, Kubernetes via Helm (primary), raw `k8s/` manifests, sizing, backups, troubleshooting |
| [operations/release.md](operations/release.md) | End-to-end release runbook for the real environment: build → push to ACR → helm release, rollback, uninstall, field notes |
| [operations/ci-cd.md](operations/ci-cd.md) | Pipelines: GitHub Actions and Azure DevOps — what they do, required secrets, one-time setup |

## Other

- [presentation.md](presentation.md) — pitch/overview deck in prose: stack, features, measured savings *(Türkçe)*
- [../README.md](../README.md) — repo landing page: quickstart + using agents from Claude Code (MCP)
- [../deploy/helm/agenticbear/values.yaml](../deploy/helm/agenticbear/values.yaml) — all chart knobs, commented

## Conventions

- Docs live **only** here and in the root `README.md`; the Helm chart README is a
  pointer stub. Don't scatter new docs into source directories.
- English is the default; docs marked *(Türkçe)* are in Turkish.
