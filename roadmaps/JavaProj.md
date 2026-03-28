Here is the definitive Master Blueprint for the **TrustVault Escrow Platform**. 

You can copy and paste this entire document into any future AI prompt. It will immediately give the AI the exact context, boundaries, and technical depth of your project, preventing it from hallucinating features or suggesting tech stacks that don't align with your goals.

---

# TrustVault Escrow Platform: Master Architecture & Execution Blueprint

## 1. Project Mission & Identity
* **The Problem:** Freelancers ghosting B2B projects after partial payments, leaving companies with no recourse.
* **The Solution:** A FinTech escrow pipeline that cryptographically locks employer funds upfront and releases them strictly upon milestone completion, governed by an automated state machine.
* **The Goal:** Demonstrate enterprise-grade Java backend engineering, strict ACID database compliance, event-driven architecture, and secure microservices for an SDE-1 FinTech role.
* **Constraints:** MVP must be completed in 20 days (approx. 60-80 hours). Strict adherence to high-impact backend mechanics; UI is secondary.

## 2. System Architecture & Tech Stack
The system is an event-driven microservices architecture built using a Monorepo structure. Local development commands and scripts will be executed using Windows PowerShell.

* **API Gateway (Spring Cloud Gateway):** The single entry point, handling routing and CORS.
* **Auth Service (Spring Boot + Spring Security):** Handles RBAC (Employer vs. Freelancer) and issues JWTs stored in secure `HttpOnly` cookies.
* **Project Service (Spring Boot):** Manages the Project State Machine and Employer/Freelancer matching.
* **Escrow Service (Spring Boot):** The financial ledger. Manages virtual wallets and executes ACID-compliant fund transfers.
* **Messaging (Apache Kafka):** Handles asynchronous communication (e.g., Project Service tells Escrow Service to release funds).
* **Database (PostgreSQL + Flyway):** Two isolated databases (one for Project, one for Escrow) with strict schema migrations.
* **Frontend (React + Vite):** A lightweight dashboard for Employer/Freelancer interaction.
* **DevOps (Docker + GitHub Actions):** Containerized deployment to a Hetzner Linux VPS.

## 3. Core Business Logic (The Non-Negotiables)
If a feature violates these rules, it is out of scope.

* **The Financial Rule:** A Freelancer cannot accept a project unless the Employer's funds are 100% locked in the Escrow Ledger (State: `FUNDED`).
* **The State Machine Strictness:** A project must strictly flow through these states: `DRAFT` $\rightarrow$ `FUNDED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `SETTLED` (or `DISPUTED`).
* **State-Based Access Control:** An Employer cannot edit or delete a project once it leaves the `DRAFT` state without triggering a financial refund workflow.
* **The Chat Fallback:** Real-time WebSockets are scoped out for the MVP. Communication is handled via a state-locked "Comments" API. Public when `FUNDED`, private (only Employer + Assigned Dev) when `IN_PROGRESS`.

## 4. MVP Feature List (Target-Driven Scope)

### Phase 1: Identity & Routing (Days 1-4)
* [ ] Initialize Monorepo and `docker-compose.yml` for PostgreSQL & Kafka.
* [ ] **Auth Service:** Implement user registration/login.
* [ ] **Auth Service:** Generate JWT and set it as an `HttpOnly` cookie.
* [ ] **API Gateway:** Configure routes to forward requests to Auth, Project, and Escrow services.

### Phase 2: The Core Engine (Days 5-10)
* [ ] **Project Service:** Design the `Project` entity and Flyway migrations.
* [ ] **Project Service:** Implement the Java State Machine for project transitions.
* [ ] **Escrow Service:** Design the `Account` entity (Employer, Freelancer, System Vault) and Flyway migrations.
* [ ] **Escrow Service:** Implement `@Transactional` logic for locking and releasing funds safely.
* [ ] Write JUnit + Mockito tests verifying money cannot be double-spent.

### Phase 3: The Distributed Glue (Days 11-14)
* [ ] Configure Spring Kafka producer in the Project Service.
* [ ] Configure Spring Kafka consumer in the Escrow Service.
* [ ] **Workflow:** When Project moves to `SETTLED`, publish `ProjectApprovedEvent`. Escrow consumes this and moves money from Vault to Freelancer wallet.

### Phase 4: The React UI (Days 15-18)
* [ ] Build Login/Registration views.
* [ ] **Employer View:** Dashboard of owned projects + "Create Project" form.
* [ ] **Freelancer View:** "Open Market" dashboard showing all `FUNDED` projects.
* [ ] Project Detail View: State transition buttons (e.g., "Accept Contract", "Submit Work", "Approve Payment") hidden conditionally based on RBAC.
* [ ] Implement the REST-based Comments section.

### Phase 5: DevOps & Polish (Days 19-20)
* [ ] Write multi-stage `Dockerfile` for the React app and all 4 Java services.
* [ ] Create a GitHub Actions CI pipeline to run Maven tests on push.
* [ ] Deploy via `docker-compose up -d` on the Hetzner VPS.

---

### End of Blueprint

You now have your north star. Every time you sit down for your 3-4 hour block, look at the active phase and tackle exactly what is on that list. 

Are we ready to dive into **Phase 1**? If so, would you like me to write the initial `docker-compose.yml` file to get PostgreSQL and Kafka running, or do you want to start by scaffolding the Spring Boot Auth Service?