# Penneo Agent Skill

A Claude Code skill for sending documents for signing via Penneo, checking signing status, and listing case files.

## Install

```bash
git clone https://github.com/berlin-not-dev/Penneo-agent-skill ~/.claude/skills/penneo-agent-skill
```

Claude Code will pick it up automatically. No restart needed.

## Setup

Before using the skill, you need to create a Penneo OAuth client and add your credentials to a `.env` file. See the **Prerequisites** section in [SKILL.md](SKILL.md) for step-by-step instructions.

## What it can do

- Send PDFs to one or more signers (with optional signing order)
- Check the status of a signing request
- List and filter case files by status, date, or title

## Requirements

- Node.js ≥ 18
- A Penneo account with administrator access
