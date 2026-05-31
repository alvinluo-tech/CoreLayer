# Contributing to Jarvis

Thank you for your interest in contributing to Jarvis! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Rust** >= 1.77.2
- **Tauri CLI** (installed as dev dependency)

### Setup

```bash
# Clone the repository
git clone https://github.com/alvinluo-tech/CoreLayer.git
cd jarvis

# Install dependencies
pnpm install

# Start development
pnpm dev
```

## Development Workflow

### Branch Naming

- `feat/<description>` — new features
- `fix/<description>` — bug fixes
- `docs/<description>` — documentation changes
- `refactor/<description>` — code refactoring

### Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/). All commit messages are validated by commitlint.

Format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Scopes: `ui`, `tauri`, `voice`, `chat`, `daemon`, `db`, `config`, `deps`, `ci`, `docs`

Examples:
```
feat(voice): add wake word detection
fix(tauri): resolve IPC token expiration
docs(readme): update installation instructions
```

### Code Style

- **TypeScript/TSX**: ESLint + Prettier (auto-formatted on commit)
- **Rust**: rustfmt + Clippy (auto-formatted on commit)
- Pre-commit hooks run automatically via Husky + lint-staged

### Running Checks

```bash
# Frontend lint
pnpm lint

# Frontend tests
pnpm test

# Rust clippy
cargo clippy --manifest-path frontend/src-tauri/Cargo.toml -- -D warnings

# Rust format check
cargo fmt --manifest-path frontend/src-tauri/Cargo.toml -- --check
```

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Ensure all checks pass (lint, test, clippy, build).
3. Update documentation if needed.
4. Submit a pull request with a clear description of changes.
5. Link any related issues.

## Reporting Issues

Use the [Bug Report](/.github/ISSUE_TEMPLATE/bug_report.md) template for bugs and the [Feature Request](/.github/ISSUE_TEMPLATE/feature_request.md) template for suggestions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
