# Penneo Agent Skill

An agent skill for sending documents for signing via Penneo, checking signing status, and listing case files.

## Install

Clone the repository into your agent's skills directory:

```bash
git clone https://github.com/berlin-not-dev/Penneo-agent-skill penneo-agent-skill
```

## Setup

Before using the skill, you need to create a Penneo OAuth client and add your credentials to a `.env` file. See the **Prerequisites** section in [SKILL.md](SKILL.md) for step-by-step instructions.

## What it can do

- Send PDFs to one or more signers (with optional signing order)
- Check the status of a signing request
- List and filter case files by status, date, or title

## Requirements

- Node.js ≥ 18
- A Penneo account with administrator access
