Documenting your architectural choices is exactly what senior engineers do. In the industry, these are called **Architectural Decision Records (ADRs)**. When you sit in that MasterCard interview and they ask, "Why did you build it this way?", having these pre-recorded, logical justifications will set you apart from every other candidate.

Let's nail down the exact architecture, the resources you need to defend it, and the sequential action plan to build it.

### 1. The Microservice Architecture & Justifications (Your ADRs)

We are building **four** distinct microservices. 

Here is the exact layout and the strict reasoning you will use in your interview to defend these choices.

**1. API Gateway (Spring Cloud Gateway)**
* **What it does:** The single public entry point for the React frontend.
* **The "Why" (Interview Defense):** "Instead of having the React app manage four different API URLs and handle CORS for each, I implemented an API Gateway. It centralizes routing and hides the internal network structure. It also acts as a security perimeter where I can implement global rate-limiting to prevent DDoS attacks before traffic even reaches my core business logic."

**2. Auth Service (Spring Security)**
* **What it does:** Issues and validates JWTs.
* **The "Why" (Interview Defense):** "Identity needs to be isolated. By separating Auth, if the Project Service goes down under heavy load, users can still log in and access their dashboards via other services. I utilized `HttpOnly` cookies for the JWT to strictly prevent Cross-Site Scripting (XSS) attacks, which is a non-negotiable security standard in FinTech."

**3. Project Service (The Orchestrator)**
* **What it does:** Manages the Escrow State Machine (`FUNDED` $\rightarrow$ `IN_PROGRESS`, etc.).
* **The "Why" (Interview Defense):** "This service encapsulates the business rules of the contract. It does not handle money. It strictly enforces the state transitions using the State Design Pattern, ensuring a project cannot be moved to 'Completed' unless it was legally 'In Progress' first."

**4. Escrow / Ledger Service (The Financial Core)**
* **What it does:** Manages the virtual wallets and executes the fund transfers.
* **The "Why" (Interview Defense):** "I isolated the financial ledger to minimize the blast radius of any bugs. This service strictly relies on Spring's `@Transactional` annotations to guarantee ACID compliance. If a server crashes halfway through a fund transfer, the database rolls back completely, ensuring no money is digitally 'lost' or 'duplicated'."

#### The Infrastructure Decisions (Addressing your 1 DB thought)

* **The Database Setup (Correction):** You mentioned "1 db". We will run **one PostgreSQL Docker container**, but inside that container, we will create **two completely separate logical databases** (one for the Project Service, one for the Escrow Service). 
    * **The "Why":** "The golden rule of microservices is *Database-per-Service*. If the Project Service and Escrow Service share the exact same tables, they become tightly coupled. If I change a column in the Escrow table, the Project Service breaks. By giving them separate databases, they can only communicate via well-defined APIs or Kafka events."
* **The Messaging Setup (1 Kafka Broker):**
    * **The "Why":** "Synchronous HTTP calls between services create cascading failures (if Escrow is down, Project crashes). I implemented Apache Kafka for asynchronous event-driven communication using the Choreography Saga pattern. The Project Service simply broadcasts a `ProjectApprovedEvent` and moves on. The Escrow Service listens and processes the payment safely."
* **No Caching (Redis):**
    * **The "Why":** "Premature optimization is the root of all evil. For an MVP escrow platform, data consistency and freshness are far more critical than millisecond read speeds. Serving a stale financial balance from a Redis cache could result in severe business logic errors. All reads go directly to the primary database."

---

### 2. The "Holy Grail" Resources for Architecture

To understand these concepts deeply and speak the language of software architects, rely on these three resources:

1. **Book: *Designing Data-Intensive Applications* by Martin Kleppmann.** This is the undisputed bible of backend engineering. It will teach you exactly how databases work under the hood, how replication works, and how to handle race conditions. 
2. **Website: Microservices.io (by Chris Richardson).** This site catalogs every microservice design pattern (Database-per-service, Saga pattern, API Gateway pattern). Use this as your reference dictionary.
3. **Website: MartinFowler.com.** Fowler is a legend in software design. His articles on Event-Driven Architecture and Bounded Contexts are required reading for enterprise developers.

---

### 3. The Step-by-Step Action Plan

We will build this layer by layer. Do not write a single line of Spring Boot code until Step 3. 

**Step 1: Data & Flow Design (Visual Architecture)**
* **Task:** Draw the Entity Relationship Diagram (ERD). Define the exact tables for the Project DB and the Escrow DB.
* **Task:** Draw the Sequence Diagram. Map out the exact step-by-step flow of data when a user clicks "Approve Project" (Frontend $\rightarrow$ Gateway $\rightarrow$ Project Service $\rightarrow$ Kafka $\rightarrow$ Escrow Service $\rightarrow$ DB).

**Step 2: Low-Level Design (UML & OOP)**
* **Task:** Create a UML Class Diagram specifically for the **Project State Machine**. Define the abstract state classes and the concrete implementations (`DraftState`, `FundedState`). 
* **Task:** Define the Data Transfer Objects (DTOs) that your frontend will send to your backend.

**Step 3: Infrastructure Setup**
* **Task:** Create the `docker-compose.yml` file.
* **Task:** Boot up PostgreSQL and Apache Kafka locally.
* **Task:** Open PowerShell and create the two distinct databases inside your Postgres container.
```powershell
# Example PowerShell command to execute a script inside the postgres container
docker exec -it postgres_db psql -U postgres -c "CREATE DATABASE project_db; CREATE DATABASE escrow_db;"
```

**Step 4: Scaffolding & Security (The API Gateway & Auth)**
* **Task:** Generate the API Gateway and Auth Service using Spring Initializr.
* **Task:** Implement JWT generation and secure the gateway routes. Test this using Postman to ensure you can get a token and access a protected dummy route.

**Step 5: Core Domain Implementation (Project & Escrow)**
* **Task:** Generate the Project and Escrow services.
* **Task:** Implement Flyway migration scripts to create your tables.
* **Task:** Use Test-Driven Development (TDD). Write JUnit tests for your State Machine and your `@Transactional` ledger transfers *first*, then write the Java code to make the tests pass.

**Step 6: The Event-Driven Glue (Kafka Integration)**
* **Task:** Add Spring Kafka dependencies.
* **Task:** Write the Producer config in the Project Service to emit events.
* **Task:** Write the Consumer config in the Escrow Service to listen for those events and trigger the database updates.

**Step 7: The Frontend & Deployment**
* **Task:** Scaffold the React (Vite) application. Build the specific UI flows for Employer and Freelancer.
* **Task:** Containerize all applications using Dockerfiles and deploy to Hetzner.

---

We have the architecture locked, the reasoning documented, and the roadmap laid out. 

To kick off **Step 1**, would you like to design the database tables (ERD) first, or would you prefer to map out the Sequence Diagram of the "Approve Payment" flow?