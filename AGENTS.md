# Repository Guidelines

## Project Structure & Module Organization
RiftFlythrough is an offline Three.js viewer backed by Python tooling. `flythrough.html` is the browser entry point and imports ES modules from `js/`; keep viewer behavior split by concern (`controls.js`, `scene.js`, `world.js`, `ui.js`, etc.). Python utilities live at the repo root (`run.py`, `dev.py`, `merge_objs.py`, `validate_obj.py`, `check.py`). Tests are in `tests/` and should mirror the utility they cover, such as `tests/test_merge_objs.py`. Large generated/runtime assets include `merged.obj`, `textures/converted/`, `objs/`, and `zone_locations.json`; avoid rewriting them unless the task is asset-related. Among those, only `merged.obj` is currently tracked.

## Build, Test, and Development Commands
- `python run.py [--port 8000]` starts the static server and opens the viewer.
- `python dev.py [--port 8000]` starts the live-reload dev server for `js/` and asset changes.
- `python check.py` runs the unified local health check: Python lint/format checks, JavaScript/HTML checks, pytest, and OBJ validation.
- `pytest tests/ -q` runs the Python unit tests.
- `python validate_obj.py --obj merged.obj` validates merged world geometry.
- `pre-commit run --all-files` runs the configured hooks before a PR.

## Coding Style & Naming Conventions
Python targets 3.9+ and uses Ruff with 4-space indentation, double quotes, imports sorted, and a 120-character line length. JavaScript uses ES modules, Biome formatting, 2-space indentation, double quotes, semicolons, and a 100-character line width. Use `snake_case` for Python functions/files, `camelCase` for JavaScript functions and variables, and descriptive module names by feature.

## Testing Guidelines
Use pytest for Python utilities. Name test files `test_<module>.py` and test functions `test_<behavior>()`. CI enforces at least 70% coverage with `pytest --cov`; add regression tests for parser, merge, validation, or coordinate-transform changes. For viewer changes, also run `python check_js.py` and `python check_html.py`.

## Commit & Pull Request Guidelines
History uses Conventional Commit-style prefixes (`feat:`, `fix:`, `style:`, `refactor:`). Keep commits focused and imperative. PRs should describe the change, list validation commands run, link related issues or handoffs, and include screenshots/GIFs for visible UI changes.

## Agent-Specific Instructions
For library, framework, SDK, API, CLI, or cloud-service questions, fetch current docs with Context7 before answering. After completing work, include a brief optional top-10 next-actions list when it adds value.

## Planning & milestones
- **`ROADMAP.md`** — prioritization (P0–P3), milestones M0–M7, exit criteria, metrics.
- **`SESSION_HANDOFF.md`** — current HEAD, validation results, next actions.
- Prefer asset-pipeline fidelity (geometry integrity, identity, placement, textures) over new viewer features until P0 exit criteria pass.
- Plan before execute; validate with `python check.py` (or targeted checks) after changes.
