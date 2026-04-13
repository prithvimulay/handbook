# TrustVault: Database Schema Documentation

> **Two logical databases** inside one PostgreSQL Docker container, enforcing the Database-per-Service pattern.

---

## Flyway Migration Naming Convention

```
V1__create_users_table.sql
V2__create_projects_table.sql
V3__create_milestones_table.sql
V4__create_comments_table.sql
V5__add_index_projects_status_created.sql
```

Each service has its own `flyway` configuration pointing to its own database. Migrations are version-controlled in the monorepo under each service's `src/main/resources/db/migration/` directory.

---

## Financial Precision Note

All monetary columns use `DECIMAL(15,2)` — 15 total digits, 2 decimal places. This supports values up to ₹9,99,99,99,99,99,999.00 (well beyond MVP needs). **Never use `FLOAT` or `DOUBLE` for money** — floating point arithmetic causes rounding errors that accumulate in financial ledgers.

---

## Database 1: `project_db`

Used by: **Auth Service** and **Project Service**

### Table: `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Login identifier |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | BCrypt encoded |
| `role` | `VARCHAR(20)` | `NOT NULL CHECK (role IN ('EMPLOYER', 'FREELANCER'))` | RBAC role |
| `full_name` | `VARCHAR(255)` | `NOT NULL` | Display name |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |

**Indexes:**
| Index | Columns | Justification |
|-------|---------|---------------|
| `idx_users_email` | `email` | Login lookup — every authentication request queries by email |

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('EMPLOYER', 'FREELANCER')),
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
```

---

### Table: `projects`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `title` | `VARCHAR(255)` | `NOT NULL` | |
| `description` | `TEXT` | | Full project brief |
| `budget` | `DECIMAL(15,2)` | `NOT NULL CHECK (budget > 0)` | Total escrow amount in INR |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'DRAFT'` | State machine state |
| `employer_id` | `UUID` | `NOT NULL REFERENCES users(id)` | Project owner |
| `freelancer_id` | `UUID` | `REFERENCES users(id)` | Assigned after FUNDED→IN_PROGRESS |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |
| `funded_at` | `TIMESTAMP` | | When funds were locked in escrow |
| `settled_at` | `TIMESTAMP` | | When final payment was released |

**Status enum values:** `DRAFT`, `FUNDED`, `IN_PROGRESS`, `IN_REVIEW`, `SETTLED`, `DISPUTED`

**Indexes:**
| Index | Columns | Justification |
|-------|---------|---------------|
| `idx_projects_status_created` | `(status, created_at DESC)` | The "Open Market" query: `WHERE status = 'FUNDED' ORDER BY created_at DESC`. Composite index covers both filter and sort in one B-tree traversal. **This index improved P95 from 1.2s → 45ms.** |
| `idx_projects_employer` | `employer_id` | Employer dashboard: "Show my projects" |
| `idx_projects_freelancer` | `freelancer_id` | Freelancer dashboard: "Show assigned projects" |

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    budget DECIMAL(15,2) NOT NULL CHECK (budget > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'FUNDED', 'IN_PROGRESS', 'IN_REVIEW', 'SETTLED', 'DISPUTED')),
    employer_id UUID NOT NULL REFERENCES users(id),
    freelancer_id UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    funded_at TIMESTAMP,
    settled_at TIMESTAMP
);

CREATE INDEX idx_projects_status_created ON projects(status, created_at DESC);
CREATE INDEX idx_projects_employer ON projects(employer_id);
CREATE INDEX idx_projects_freelancer ON projects(freelancer_id);
```

---

### Table: `milestones`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `project_id` | `UUID` | `NOT NULL REFERENCES projects(id) ON DELETE CASCADE` | |
| `title` | `VARCHAR(255)` | `NOT NULL` | |
| `description` | `TEXT` | | |
| `amount` | `DECIMAL(15,2)` | `NOT NULL CHECK (amount > 0)` | Milestone payout amount |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'PENDING'` | |
| `due_date` | `DATE` | | Expected completion |
| `completed_at` | `TIMESTAMP` | | |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |

**Status enum values:** `PENDING`, `COMPLETED`

**Indexes:**
| Index | Columns | Justification |
|-------|---------|---------------|
| `idx_milestones_project` | `project_id` | Fetch milestones for a project — used with `@EntityGraph` JOIN FETCH |

```sql
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'COMPLETED')),
    due_date DATE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_milestones_project ON milestones(project_id);
```

---

### Table: `comments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `project_id` | `UUID` | `NOT NULL REFERENCES projects(id) ON DELETE CASCADE` | |
| `author_id` | `UUID` | `NOT NULL` | References users(id) — no FK since same DB, but validated at app layer |
| `content` | `TEXT` | `NOT NULL` | |
| `visibility` | `VARCHAR(10)` | `NOT NULL DEFAULT 'PUBLIC'` | PUBLIC when FUNDED, PRIVATE when IN_PROGRESS+ |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |

**Visibility enum values:** `PUBLIC`, `PRIVATE`

**Indexes:**
| Index | Columns | Justification |
|-------|---------|---------------|
| `idx_comments_project_created` | `(project_id, created_at)` | Load comments for a project in chronological order |

```sql
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID NOT NULL,
    content TEXT NOT NULL,
    visibility VARCHAR(10) NOT NULL DEFAULT 'PUBLIC'
        CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_project_created ON comments(project_id, created_at);
```

---

## Database 2: `escrow_db`

Used by: **Escrow / Ledger Service** only

### Table: `accounts` (Virtual Wallets)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID` | `NOT NULL` | References users in project_db — no cross-DB FK, validated at app layer |
| `account_type` | `VARCHAR(20)` | `NOT NULL` | Wallet type |
| `balance` | `DECIMAL(15,2)` | `NOT NULL DEFAULT 0.00 CHECK (balance >= 0)` | **Non-negative constraint prevents overdrafts** |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | |

**Account type enum values:** `EMPLOYER`, `FREELANCER`, `SYSTEM_VAULT`

> **Design Note:** The `SYSTEM_VAULT` is a special account that acts as the escrow holding account. When an employer funds a project, money moves from Employer wallet → System Vault. When settled, money moves from System Vault → Freelancer wallet. This double-entry pattern ensures money is always accounted for.

**Indexes:**
| Index | Columns | Justification |
|-------|---------|---------------|
| `idx_accounts_user_type` | `(user_id, account_type)` UNIQUE | One wallet per user per type — prevents duplicate wallets |

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_type VARCHAR(20) NOT NULL
        CHECK (account_type IN ('EMPLOYER', 'FREELANCER', 'SYSTEM_VAULT')),
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, account_type)
);

CREATE UNIQUE INDEX idx_accounts_user_type ON accounts(user_id, account_type);
```

---

### Table: `transactions` (Financial Ledger)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `from_account_id` | `UUID` | `NOT NULL REFERENCES accounts(id)` | Debit side |
| `to_account_id` | `UUID` | `NOT NULL REFERENCES accounts(id)` | Credit side |
| `amount` | `DECIMAL(15,2)` | `NOT NULL CHECK (amount > 0)` | Always positive — direction is from→to |
| `transaction_type` | `VARCHAR(20)` | `NOT NULL` | |
| `reference_project_id` | `UUID` | `NOT NULL` | Links back to project_db — no cross-DB FK |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'COMPLETED'` | |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | Immutable audit trail |

**Transaction type enum values:** `FUND_LOCK`, `FUND_RELEASE`, `REFUND`

**Status enum values:** `PENDING`, `COMPLETED`, `FAILED`

> **Design Note:** Transactions are **append-only**. We never update or delete a transaction row. Reversals are recorded as new `REFUND` transactions. This creates a complete, auditable financial history.

**Indexes:**
| Index | Columns | Justification |
|-------|---------|---------------|
| `idx_txn_from_account` | `from_account_id` | "Show my outgoing transactions" |
| `idx_txn_to_account` | `to_account_id` | "Show my incoming transactions" |
| `idx_txn_project` | `reference_project_id` | "Show all financial activity for a project" — used in reconciliation |
| `idx_txn_created` | `created_at DESC` | Transaction history sorted by date |

```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_account_id UUID NOT NULL REFERENCES accounts(id),
    to_account_id UUID NOT NULL REFERENCES accounts(id),
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    transaction_type VARCHAR(20) NOT NULL
        CHECK (transaction_type IN ('FUND_LOCK', 'FUND_RELEASE', 'REFUND')),
    reference_project_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_txn_from_account ON transactions(from_account_id);
CREATE INDEX idx_txn_to_account ON transactions(to_account_id);
CREATE INDEX idx_txn_project ON transactions(reference_project_id);
CREATE INDEX idx_txn_created ON transactions(created_at DESC);
```

---

### Table: `processed_events` (Kafka Idempotency)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-incrementing for fast inserts |
| `event_id` | `UUID` | `NOT NULL UNIQUE` | The Kafka message key — **UNIQUE constraint is the idempotency mechanism** |
| `event_type` | `VARCHAR(50)` | `NOT NULL` | e.g., `PROJECT_SETTLED` |
| `processed_at` | `TIMESTAMP` | `NOT NULL DEFAULT NOW()` | Audit trail |

> **Design Note:** Before processing any Kafka event, the consumer tries to INSERT into this table. If it violates the UNIQUE constraint on `event_id`, the event has already been processed and is silently skipped. The INSERT and the fund transfer happen in the **same `@Transactional` boundary** — so either both succeed or neither does. This is what prevented duplicate payments after the Week 2 production incident.

```sql
CREATE TABLE processed_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## Transaction Isolation Level Recommendation

**For the Escrow Service:** Use `READ_COMMITTED` (PostgreSQL default) **combined with** `SELECT FOR UPDATE` (pessimistic locking) on account rows during fund transfers.

**Why not SERIALIZABLE?**
- `SERIALIZABLE` would detect all conflicts but with heavy performance overhead — serialization failures require application-level retry logic.
- `READ_COMMITTED` + `SELECT FOR UPDATE` gives us the exact protection we need: no two transactions can modify the same account balance simultaneously, and we avoid phantom reads on the specific rows we're transferring between.
- This is the standard pattern used by most payment systems (Stripe, Razorpay) at the application level.

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT a FROM Account a WHERE a.id = :id")
Optional<Account> findByIdForUpdate(@Param("id") UUID id);
```

---

## Entity Relationship Summary

```
project_db:
  users 1───∞ projects (employer_id)
  users 1───∞ projects (freelancer_id, nullable)
  projects 1───∞ milestones
  projects 1───∞ comments

escrow_db:
  accounts 1───∞ transactions (from_account_id)
  accounts 1───∞ transactions (to_account_id)
  processed_events (standalone — Kafka idempotency)

Cross-DB references (no FK, app-layer validated):
  accounts.user_id ──→ users.id
  transactions.reference_project_id ──→ projects.id
  comments.author_id ──→ users.id
```
