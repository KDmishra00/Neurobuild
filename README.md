# Neurobuild

Neurobuild is a prompt-to-website builder. A user can create an account, describe a site, generate it with a local Ollama model or compatible cloud model, preview it in a sandbox, edit its HTML/CSS/JavaScript, refine it with AI, save projects, revisit them, and download a self-contained website.

## What is included

- Email/password accounts with secure password hashing and JWT sessions
- Prompt-to-site generation, model chooser, caching, rate limiting, and a two-stage or parallel AI pipeline
- Responsive desktop/tablet/mobile preview, safe iframe isolation, editable source, copy, open, and ZIP export
- Templates, prompt history, profile and generation settings
- Server-backed projects with automatic saved versions, account-level listing, load, save, and clear
- Account deletion that also removes the user's saved projects

## Run locally

1. Install Node.js 20+ and MongoDB 7+, then start MongoDB.
2. Install Ollama, start it, and pull a model such as `ollama pull gemma:latest`.
3. Copy `.env.example` to `.env`, set a unique `JWT_SECRET`, and adjust `MONGODB_URI` or model settings if required.
4. Run `npm install`, then `npm run dev`.
5. Open [http://localhost:3000](http://localhost:3000), create an account, and generate your first site.

## Run with Docker

1. Copy `.env.example` to `.env` and set a unique `JWT_SECRET`.
2. Keep Ollama running on your host, or set `OLLAMA_URL` to a reachable model server.
3. Run `docker compose up --build` and open [http://localhost:3000](http://localhost:3000).

On macOS and Windows the included `host.docker.internal` setting reaches host Ollama. On Linux it is mapped through Docker's `host-gateway` feature.

## Cloud models

For OpenRouter-compatible generation, set `CLOUD_API_KEY` and optionally `CLOUD_API_URL`. Then select one of the OpenRouter-labelled models in the product. Never expose that key in browser code or commit `.env`.

## Production checklist

- Set `NODE_ENV=production`, a long random `JWT_SECRET`, `MONGODB_URI`, and `ALLOWED_ORIGINS` to your public HTTPS domain.
- Put the app behind HTTPS and a reverse proxy that supports streaming responses.
- Configure a paid model provider or a suitable dedicated Ollama server; public traffic consumes model capacity and may create cost.
- Add email verification, password reset, billing/usage quotas, and object storage before an open public launch.

## Verification

Run `npm test` to syntax-check all server-side routes and the browser API helper.

---

## Module 6: Collaborative Agentic AI

Module 6 upgrades Neurobuild from generating isolated, static front-end prototypes into an autonomous multi-agent engineering team that produces **production-ready, dynamic web applications backed by real database schemas, API contracts, and interactive visualizations**.

### Why Use Agentic AI Here?

> **Why not use a single prompt?**
> A single large language model prompt cannot reliably generate an entire full-stack system simultaneously. When asked to produce HTML, CSS, JavaScript, database schemas, REST APIs, and mock data in one shot, single prompts frequently suffer from context drift, mismatched column names, hallucinated endpoints, and omitted validation logic.
>
> In contrast, **Collaborative Agentic AI** decomposes the problem across specialized agents (Planner, Database, Backend, Frontend, and Reviewer) operating with a **Shared Context and Pub/Sub Message Bus**. When the Database Agent introduces or modifies a column, dependent agents (Backend routes, Frontend forms and data tables) are automatically notified and adjust accordingly. If inconsistencies arise, the Reviewer Agent flags them and triggers an automated revision loop to ensure end-to-end contract alignment.

### Multi-Agent Architecture

```mermaid
flowchart TD
    User([User Prompt: 'Student Management System']) --> BaseGen[Base Static Generator]
    BaseGen --> UserClick[User clicks 'Enhance with Agentic AI']
    
    subgraph SharedEnv["Shared Collaboration Environment"]
        SharedContext[("Shared Context\n(Schema, API Contract, Tasks, State)")]
        MessageBus{{"Message Bus (Pub/Sub Event Log)"}}
    end

    UserClick --> Planner[1. Planner / Orchestrator Agent]
    
    Planner -->|Analyzes domain & creates dynamic tasks| SharedContext
    Planner -.->|plan:created| MessageBus
    
    MessageBus -.->|triggers| DBAgent[2. Database Agent]
    DBAgent -->|Generates tables, SQLite DDL, seed data| SharedContext
    DBAgent -.->|schema:updated| MessageBus
    
    MessageBus -.->|triggers| BackendAgent[3. Backend Agent]
    BackendAgent -->|Produces Express CRUD routes & contract| SharedContext
    BackendAgent -.->|api:defined| MessageBus
    
    MessageBus -.->|triggers| FrontendAgent[4. Frontend / Viz Agent]
    FrontendAgent -->|Generates CRUD UI, Table & Chart.js| SharedContext
    FrontendAgent -.->|html:updated| MessageBus
    
    MessageBus -.->|triggers| ReviewerAgent[5. Reviewer / QA Agent]
    ReviewerAgent -->|Audits imports, field match, routes| SharedContext
    
    ReviewerAgent -->|Issues found| RevisionLoop{"Revision Needed?"}
    RevisionLoop -->|Yes (max 2 revisions)| FrontendAgent
    RevisionLoop -->|No (Passed)| FinalResult[Final Enhanced Dynamic Site]
    
    FinalResult --> DBRecord[(MongoDB AgentRun Persistence)]
    FinalResult --> UIPreview[Live Interactive Preview & Download Code]
```

### Agent Roles & Responsibilities

| Agent | Responsibility | Output / Artifact |
|---|---|---|
| 🧠 **Planner / Orchestrator** | Analyzes the base website and original prompt, detects domain type (management, e-commerce, blog, etc.), determines data requirements, and generates dynamic tasks. | Domain analysis, feature requirements, prioritized task list. |
| 🗄️ **Database Agent** | Designs relational schema (tables, fields, types, foreign keys), generates SQLite DDL statements, and provides realistic domain seed data. | Schema JSON contract, SQL DDL script, seed records. |
| ⚙️ **Backend Agent** | Uses the database schema to author Express.js REST API routes (GET, POST, PUT, DELETE) with input validation. | API Contract JSON (endpoints, methods, request/response shapes), Express route file. |
| 🎨 **Frontend / Visualization Agent** | Upgrades the base HTML into an interactive data management application with in-iframe storage, data tables, search/filtering, add/edit/delete modals, and Chart.js metrics. | Production-grade self-contained HTML/CSS/JS with working CRUD & charts. |
| 🔍 **Reviewer / QA Agent** | Performs cross-contract validation checking for schema field mismatches, missing CRUD endpoints, broken variables, or absent charts. Triggers targeted revisions when needed. | QA report, issue breakdown (high/medium/low severity), revision directives. |

### Inter-Agent Collaboration & Contract Format

Agents communicate through a shared, strongly-typed JSON contract structure:

```json
{
  "schema": {
    "tables": [
      {
        "name": "students",
        "fields": [
          { "name": "id", "type": "INTEGER", "primaryKey": true },
          { "name": "name", "type": "TEXT", "required": true },
          { "name": "email", "type": "TEXT", "unique": true },
          { "name": "course_id", "type": "INTEGER", "foreignKey": "courses.id" },
          { "name": "grade", "type": "TEXT" }
        ]
      }
    ]
  },
  "apiContract": {
    "endpoints": [
      { "method": "GET", "path": "/api/students", "description": "List all students" },
      { "method": "POST", "path": "/api/students", "description": "Create a new student" },
      { "method": "PUT", "path": "/api/students/:id", "description": "Update a student" },
      { "method": "DELETE", "path": "/api/students/:id", "description": "Delete a student" }
    ]
  }
}
```

- **Propagation Example**: If the Database Agent introduces a `grade` column, the Backend Agent automatically specifies `grade` in its validation and SQL updates, and the Frontend Agent adds a `Grade` column to the table and a grade input in the Add/Edit modal.
- **Revision Loop**: If the Reviewer detects that an HTML form input does not match a required schema field, it publishes a `review:revision_needed` message back to the Frontend Agent, which applies the targeted fix (capped at 2 iterations to avoid infinite loops).

### How to Run the End-to-End Demo

1. **Start the server**:
   ```bash
   npm run dev
   ```
2. **Open the App**:
   Navigate to [http://localhost:3000](http://localhost:3000) (or dev server port) and sign in.
3. **Generate Base Site**:
   - Enter prompt: `"Student Management System"`
   - Click **Generate**.
   - The initial static website appears in the Live Preview panel.
4. **Click "Enhance with Agentic AI"**:
   - Click the prominent **Enhance with Agentic AI** button in the preview header.
   - The **Module 6 Multi-Agent Hub** modal opens with live SSE streaming telemetry.
   - Watch the 5 agents collaborate in real-time across the pipeline:
     1. **Planner**: Analyzes the site and generates dynamic tasks.
     2. **Database**: Creates `students` and `courses` schema with SQLite DDL and seed data.
     3. **Backend**: Produces REST API routes matching table columns.
     4. **Frontend**: Generates a live interactive student table with add/edit/delete and a Chart.js grade distribution chart.
     5. **Reviewer**: Audits the code against contracts.
5. **Interact and Verify**:
   - Test CRUD operations directly inside the interactive preview (Add student, Edit grade, Delete student).
   - Inspect the **Shared Contracts** tab to view the generated SQL DDL and Express routes.
   - Click **Apply Enhanced Dynamic Website** to replace the base site, or **Download Site Code** to export the project bundle.

