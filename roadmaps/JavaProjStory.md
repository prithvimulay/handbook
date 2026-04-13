# TrustVault: The Production Story

> **How to use this document:** This is your interview narrative. Read it, internalize it, and practice telling these stories out loud. Never read from a script — instead, know the beats and speak naturally. Each section maps to common interview questions.

---

## 1. Company & Team Context

**Your talking points:**

I was working at **VaultPay Solutions**, a B2B fintech startup based out of Bangalore — about 10-12 engineers total. We were building payment infrastructure products for mid-market companies. My team specifically was a 6-person squad: 3 backend engineers (including me), 1 frontend developer, 1 DevOps engineer, and a product manager.

I joined the team when they were pivoting from a simple invoicing tool to a full escrow-as-a-service platform. My role was **Backend Engineer — I owned the Escrow Ledger Service and the Kafka integration pipeline**. My colleague Arjun handled the Auth Service, and Sneha owned the Project Service and the state machine logic. Our DevOps guy Karthik managed the infrastructure and CI/CD.

**Why this framing works:** You're not claiming you built everything. You owned 2 critical pieces. Interviewers find this more credible than "I built the whole system."

---

## 2. The Client & Problem Discovery

**Your talking points:**

Our client was a mid-sized IT staffing company — let's call them TalentBridge Staffing. They operated in the contract-to-hire space, connecting freelance developers with companies for short-term B2B projects.

Their CTO reached out to us because they had a serious cash flow problem. They were losing roughly ₹15-20 lakhs annually to what they called "freelancer ghosting" — developers who would accept a project, get 30-40% of the payment upfront as a milestone advance, and then just disappear. The staffing company had no technical mechanism to hold the money safely or enforce delivery before releasing funds.

**The discovery phase looked like this:**

In the first call, their CTO and operations head walked us through the pain. They showed us spreadsheets where they were manually tracking which freelancers had been paid what, and which projects were stuck. It was all manual reconciliation — no system of record.

In the second meeting, we did a **requirements workshop**. They had a long wish list — real-time chat between employer and freelancer, a rating system, automated dispute resolution via AI, milestone-based partial releases. Our PM did a good job of pushing back.

The scope negotiation was the hardest part. They really wanted **WebSocket-based real-time chat**. We pushed back hard because we had an 8-week timeline for the MVP. We proposed a REST-based comments system instead — state-locked, so comments are public when a project is in the marketplace, but become private once a freelancer is assigned. The client wasn't happy initially, but when we showed them that this still solved 90% of their communication needs without the complexity of maintaining WebSocket connections, they agreed. We moved real-time chat to the v2 roadmap.

**The final scoped MVP:** An escrow pipeline where employers lock 100% of the project budget upfront, freelancers can only accept funded projects, and funds are released automatically upon employer approval through an event-driven settlement flow.

---

## 3. Architecture Discussions — How We Decided

**Your talking points:**

We had a proper architecture review session before writing any code. Our tech lead initially suggested a monolith — simpler to deploy, faster to build, and honestly, for a 6-person team, that's usually the right call.

But our CTO pushed for microservices, and his reasoning was sound: **the financial ledger needed to be completely isolated from the project management logic**. If a bug in the project listing code somehow corrupted a financial transaction, that's a regulatory nightmare. By isolating the Escrow Service with its own database, we minimized the blast radius. Any bug in the Project Service literally cannot touch the money tables.

**The sync vs. async debate was the most heated discussion.** We initially built everything with synchronous HTTP calls between services. The Project Service would call the Escrow Service directly via REST to release funds when a project was approved. This worked fine in development.

Then Karthik ran our first JMeter load test — 200 concurrent users simulating the settlement flow. The Escrow Service had a spike in response times (P95 hit 3 seconds), and because the Project Service was waiting synchronously, it started timing out too. We saw **cascading failures** — exactly what the textbooks warn about. When one service slowed down, it dragged down the caller.

That's when we decided to use **Apache Kafka for the settlement flow specifically**. The fund-locking (DRAFT → FUNDED) stayed synchronous because the employer needs immediate confirmation. But the settlement (SETTLED → fund release) became asynchronous — the Project Service publishes a `ProjectSettledEvent` to Kafka and moves on. The Escrow Service consumes it independently.

**The Redis debate was quick.** Someone suggested caching wallet balances in Redis. Our tech lead shut it down immediately — "Serving a stale financial balance from a cache could result in a freelancer accepting a project that isn't actually funded. Every read hits the primary database." In fintech, **data freshness beats read speed**.

---

## 4. My Specific Ownership & Contributions

**Your talking points (be specific — interviewers love specificity):**

I owned two major pieces:

### The Escrow Ledger Service
- Designed the database schema — `accounts` table (virtual wallets for Employers, Freelancers, and a System Vault), `transactions` table (every fund movement is a ledger entry), and the `processed_events` table for Kafka idempotency.
- Wrote all the Flyway migration scripts (`V1__create_accounts_table.sql`, `V2__create_transactions_table.sql`, etc.)
- Implemented the core `@Transactional` fund transfer logic — debit from one account, credit to another, all within a single database transaction. If anything fails mid-transfer, the whole thing rolls back.
- Implemented **pessimistic locking** using `SELECT FOR UPDATE` on the account rows to prevent race conditions during concurrent fund transfers.

### The Kafka Integration Pipeline
- Configured Spring Kafka producer in the Project Service (Sneha's service) — I worked with her to define the event schema.
- Built the consumer in the Escrow Service that listens for `ProjectSettledEvent` and triggers the fund release.
- Implemented the **idempotent consumer pattern** — this was my biggest contribution and became an incident story (more on that later).

### Other Contributions
- Set up **JMeter load testing** for the financial endpoints — 200 concurrent users, measuring P95 latency for fund-lock and settlement.
- Wrote **JUnit + Mockito unit tests** and integration tests using TestContainers for the Escrow Service. We had 85% code coverage on the financial logic.

---

## 5. Engineering Challenges During Development

### Challenge 1: The N+1 Query Problem
**When it happened:** Week 3, while Sneha was building the project listing endpoint.

**The problem:** The "Open Market" endpoint that shows all `FUNDED` projects was making 1 query to fetch projects, then N additional queries to fetch milestones for each project. For a page of 20 projects with 5 milestones each, that was **101 database queries** for a single API call.

**How we found it:** I noticed the endpoint was taking 800ms in our staging environment. I turned on Hibernate's `show_sql` logging and saw the flood of queries.

**The fix:** We used `@EntityGraph(attributePaths = {"milestones"})` on the repository method to eager-load milestones in a single `JOIN FETCH` query. Query count dropped from 101 to **1 query**. Response time: **800ms → 95ms**.

### Challenge 2: Database Deadlocks on Concurrent Fund Transfers
**When it happened:** Week 4, during my first JMeter load test.

**The problem:** When two requests tried to transfer funds involving the same accounts simultaneously, PostgreSQL threw deadlock errors. The default optimistic locking (`@Version`) wasn't sufficient because both transactions would read the same balance, then both try to update it.

**The fix:** I switched to **pessimistic locking** — `@Lock(LockModeType.PESSIMISTIC_WRITE)` on the account repository query, which translates to `SELECT ... FOR UPDATE` in SQL. This forces the second transaction to wait until the first one commits. Deadlocks went to zero. The tradeoff is slightly lower throughput, but for a financial system, **correctness > speed**.

### Challenge 3: Connection Pool Exhaustion
**When it happened:** Week 5, during extended load testing.

**The problem:** Under sustained load (200 concurrent users for 5 minutes), the Escrow Service started throwing `SQLTransientConnectionException: Connection is not available, request timed out after 30000ms`. HikariCP's default pool size of 10 connections was getting exhausted because the pessimistic locks were holding connections longer.

**The fix:** Tuned HikariCP configuration:
- `maximum-pool-size`: 10 → 25
- `connection-timeout`: 30s → 10s (fail fast rather than queue up)
- `idle-timeout`: 600s → 300s
- Added `leak-detection-threshold: 5000` to catch any connection leaks early.

After tuning, the connection pool stabilized and P95 for the fund-lock endpoint dropped to **120ms**.

### Challenge 4: Kafka Serialization Mismatch
**When it happened:** Week 6, during Kafka integration.

**The problem:** The Project Service (Sneha's code) was serializing the `ProjectSettledEvent` using Spring's default Jackson serializer, but it was including class type info in the JSON. My consumer in the Escrow Service was trying to deserialize it into a different package path and failing with `ClassNotFoundException`.

**The fix:** We created a **shared DTO module** — a separate Maven module in the monorepo containing only the event classes and DTOs. Both services depended on this module. We also configured a `JsonDeserializer` with explicit trusted packages. This eliminated the mismatch completely.

---

## 6. Pre-Production Load Testing

**Your talking points:**

Before deploying to production, we ran a comprehensive JMeter suite. The setup:
- **200 concurrent virtual users** simulating a mix of employers and freelancers
- **Scenarios:** Project creation → Funding → Acceptance → Work submission → Approval → Settlement
- **Duration:** 10-minute sustained test

**Key baseline metrics (after all optimizations):**

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| POST /api/auth/login | 45ms | 85ms | 120ms |
| POST /api/projects | 35ms | 65ms | 90ms |
| POST /api/escrow/fund-lock | 55ms | 120ms | 180ms |
| Settlement (Kafka end-to-end) | 180ms | 340ms | 520ms |
| GET /api/projects (market listing) | 40ms | 95ms | 130ms |

**Error rate:** 0.02% (all from intentional insufficient-balance test cases)

The fund-lock endpoint was the one we sweated over the most — any P95 above 500ms would have been a red flag for a financial operation. At 120ms, we were comfortable.

---

## 7. Post-Deployment Incidents & Optimizations

### 🔴 CRITICAL INCIDENT: The Duplicate ₹45K Payment (Week 2 in Production)

**This is your star interview story — for "Tell me about a production incident" questions.**

**What happened:** Two weeks after go-live, our monitoring picked up a discrepancy in the daily reconciliation report. A freelancer named Priya had received ₹45,000 twice for the same project settlement. The employer's vault had been debited only once (correctly), but the freelancer's wallet showed double credit.

**Root cause analysis:** I dove into the Kafka consumer logs. What happened was a **Kafka consumer group rebalance** — triggered because we had deployed a hotfix to the Escrow Service and the consumer temporarily disconnected. When it reconnected, Kafka redelivered the `ProjectSettledEvent` because the offset hadn't been committed before the restart. My consumer processed it again, creating a second fund transfer.

**The fundamental issue:** I had assumed Kafka's "at-least-once delivery" meant "exactly once" in practice. It doesn't. Any consumer restart, rebalance, or network hiccup can cause redelivery.

**The fix (implemented same day):**
1. Created a `processed_events` table with a `UNIQUE` constraint on `event_id`.
2. Before processing any Kafka event, the consumer first tries to `INSERT` the event ID into this table.
3. If the insert fails (duplicate key violation), the event is silently acknowledged and skipped.
4. Crucially, the insert and the fund transfer are in the **same `@Transactional` boundary** — so either both happen or neither does.

**The resolution:** We manually reversed the duplicate credit for Priya (a one-time manual ledger adjustment) and deployed the idempotency fix. **Zero duplicate payments since.**

**Metrics:** Before fix: 1 duplicate in 320 settlements (0.31% error rate). After fix: 0 duplicates in 850+ settlements.

### 🟡 Slow Project Listing Query (Month 1)

**What happened:** As the data grew (500+ projects), the "Open Market" listing that shows all `FUNDED` projects started slowing down. P95 went from 95ms to **1.2 seconds**.

**Root cause:** No index on the `status` column. PostgreSQL was doing a full table scan, then sorting by `created_at`.

**The fix:** Added a **composite index**: `CREATE INDEX idx_projects_status_created ON projects(status, created_at DESC)`. The composite index covers both the `WHERE status = 'FUNDED'` filter and the `ORDER BY created_at DESC` sort in a single B-tree traversal.

**Result:** P95 dropped from 1.2s to **45ms**. A 26x improvement from one index.

### 🟡 JVM OOM Kills on VPS (Month 1)

**What happened:** Our Hetzner VPS had 4GB RAM. Running 4 Spring Boot services + PostgreSQL + Kafka was too tight. The Escrow Service kept getting OOM-killed by the Linux kernel.

**The fix:**
1. Set explicit JVM heap limits: `-Xmx512m -Xms256m` per service (total: ~2GB for 4 services, leaving room for Postgres and Kafka).
2. Switched to **layered Docker builds** using Spring Boot's `layers.idx` — this reduced each Docker image from ~680MB to ~210MB, which also sped up deployments.
3. Added a `HEALTHCHECK` in the Dockerfile so Docker Compose could restart a service if it died.

### 🟡 JWT Silent Expiry (Month 2)

**What happened:** Users were getting randomly logged out. The frontend was receiving 401s but not handling them gracefully — just showing a blank page.

**The fix:** Added a `/api/auth/refresh` endpoint that accepts the refresh token (stored in a separate HttpOnly cookie with a 7-day expiry). On the frontend, added an Axios response interceptor that catches 401s, calls the refresh endpoint, and retries the original request. If the refresh also fails, then redirect to login.

---

## 8. Production Metrics (After 3 Months)

Use these numbers when asked "What was the impact?"

- **850+ escrow transactions processed** with zero financial discrepancies (post-idempotency fix)
- **₹1.2 Crore+ in total funds processed** through the escrow pipeline
- **99.4% uptime** (downtime was planned deployments + the one OOM incident)
- **Average settlement time:** 2.3 seconds (end-to-end from employer approval to freelancer credit)
- **Zero data loss incidents** — Flyway migrations, `@Transactional` boundaries, and pessimistic locking kept the ledger pristine
- **85% unit test coverage** on the Escrow Service financial logic

---

## 9. Retrospective & Lessons Learned

**What went well:**
- The database-per-service pattern saved us during the duplicate payment incident — the blast radius was contained to the Escrow DB only
- TDD on the financial logic caught 3 edge cases before they hit production (negative balance transfers, self-transfers, zero-amount transactions)
- The scope negotiation with the client (REST comments vs WebSocket chat) kept us on schedule

**What I'd do differently:**
- **Schema Registry for Kafka from day one.** The serialization mismatch cost us 2 days. A Confluent Schema Registry would have caught incompatible schema changes at build time.
- **Structured logging with correlation IDs earlier.** Debugging the duplicate payment incident required manually correlating logs across 3 services. If we'd had a `traceId` propagated through Kafka headers from the start, root cause analysis would have taken 30 minutes instead of 4 hours.
- **Spring Boot Actuator + Prometheus from the start.** We added monitoring after the OOM incident. Should have been there from day one.
- **Would consider a monolith with modular boundaries** for a team this small. The microservices overhead (Docker networking, Kafka setup, cross-service debugging) was significant for a 6-person team. The isolation benefits are real, but so is the operational cost.

---

## 10. How to Tell This Story in Different Interview Contexts

### "Tell me about a project you've worked on"
→ Start with Section 1 (company context) → Section 2 (the problem) → Section 3 (architecture highlights) → Section 4 (your role) → Section 8 (metrics/impact). Keep it under 3 minutes. Let them ask follow-ups.

### "Tell me about a time you solved a hard bug / production incident"
→ Go straight to Section 7 — The Duplicate ₹45K Payment. Use **STAR format:**
- **Situation:** "Two weeks after deploying our escrow platform..."
- **Task:** "I needed to find why a freelancer received double payment and ensure it never happened again..."
- **Action:** "I analyzed Kafka consumer logs, identified the rebalance, and implemented an idempotency layer..."
- **Result:** "Zero duplicate payments in 850+ subsequent transactions."

### "Tell me about a time you optimized performance"
→ Use the N+1 query story (101 queries → 1) or the index optimization (P95: 1.2s → 45ms). Both have clear before/after metrics.

### "Tell me about a time you pushed back on a requirement"
→ Use the WebSocket vs REST comments story from Section 2. Show you balanced technical pragmatism with client empathy.

### "Walk me through your system architecture"
→ Draw the 4 services on a whiteboard. Explain the sync vs async split (HTTP for fund-locking, Kafka for settlement). Mention database-per-service. Let them drill into specifics.

### "What would you do differently?"
→ Section 9. Be honest. Interviewers love self-awareness. The Schema Registry and structured logging answers show you've grown from the experience.

---

## ⚠️ Credibility Rules — What NOT to Say

1. **Never say "I built the whole thing alone."** Always mention Arjun (Auth), Sneha (Project Service), Karthik (DevOps).
2. **Never claim zero bugs in production.** The duplicate payment story is a feature, not a bug — it shows you handle incidents like a professional.
3. **If they ask about the company name and you're uncomfortable,** say: "It was a B2B fintech startup — I'd prefer not to name them due to NDA, but I can walk you through the technical details in depth."
4. **Know your numbers.** If you say "P95 was 120ms" and they ask "How did you measure that?", your answer is "JMeter for load testing, and Spring Boot Actuator metrics in production."
5. **Don't memorize this document word-for-word.** Know the beats, the numbers, and the stories. Speak naturally.
