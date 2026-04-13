# TrustVault — REST API Endpoint Catalog

> **Platform:** B2B Escrow Platform  
> **Architecture:** 4 Microservices (API Gateway, Auth Service, Project Service, Escrow Service)  
> **Version:** 1.0  

---

## Table of Contents

1. [Overview](#overview)  
2. [Authentication & Security](#authentication--security)  
3. [Standardized Error Response](#standardized-error-response)  
4. [API Gateway Routing Table](#api-gateway-routing-table)  
5. [Auth Service — `/api/auth`](#auth-service--apiauth)  
6. [Project Service — `/api/projects`](#project-service--apiprojects)  
7. [Escrow Service — `/api/escrow`](#escrow-service--apiescrow)  
8. [Project Lifecycle State Machine](#project-lifecycle-state-machine)

---

## Overview

All traffic enters through a **single API Gateway** (Spring Cloud Gateway). Internal service URLs are never exposed to clients. The gateway handles:

- **Route matching** — maps public paths to internal microservice URLs  
- **JWT validation** — extracts the JWT from the `HttpOnly` cookie and forwards the authenticated `X-User-Id` and `X-User-Role` headers to downstream services  
- **Rate limiting** — per-IP and per-user token-bucket filters  
- **CORS** — configured centrally on the gateway  

Base URL (all environments):

```
https://api.trustvault.io
```

---

## Authentication & Security

| Aspect | Detail |
|---|---|
| **Token type** | JWT (JSON Web Token), signed with RS256 |
| **Token delivery** | Returned in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie named `tv_access` |
| **Token lifetime** | Access token: 15 min · Refresh token: 7 days (stored server-side) |
| **CSRF protection** | A `X-XSRF-TOKEN` header must accompany every **state-changing** request (POST/PUT/DELETE). The CSRF token value is provided in a readable `XSRF-TOKEN` cookie set alongside the JWT cookie. |
| **Role model** | `EMPLOYER`, `FREELANCER`. Some endpoints accept any authenticated user (`AUTHENTICATED`). |
| **Propagation** | The API Gateway validates the JWT and forwards `X-User-Id` (UUID) and `X-User-Role` (string) headers to internal services. |

### Example Authenticated Request

```http
POST /api/projects HTTP/1.1
Host: api.trustvault.io
Cookie: tv_access=eyJhbGciOiJSUzI1NiIs...
X-XSRF-TOKEN: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Content-Type: application/json

{ ... }
```

---

## Standardized Error Response

All services return errors using a common `ErrorResponse` DTO.

```json
{
  "timestamp": "2025-06-15T10:32:00.123Z",
  "status": 400,
  "message": "Validation failed: email must not be blank",
  "path": "/api/auth/register"
}
```

| Field | Type | Description |
|---|---|---|
| `timestamp` | `string` (ISO-8601) | When the error occurred |
| `status` | `int` | HTTP status code |
| `message` | `string` | Human-readable error description |
| `path` | `string` | The request URI that caused the error |

### Common HTTP Status Codes

| Code | Meaning |
|---|---|
| `400` | Bad Request — validation error or malformed body |
| `401` | Unauthorized — missing or invalid JWT |
| `403` | Forbidden — valid JWT but insufficient role/permission |
| `404` | Not Found — resource does not exist |
| `409` | Conflict — illegal state transition or duplicate resource |
| `500` | Internal Server Error |

---

## API Gateway Routing Table

| Public Path Prefix | Internal Service | Internal URL (Docker) | Notes |
|---|---|---|---|
| `/api/auth/**` | **Auth Service** | `http://auth-service:8081` | Registration, login, token management |
| `/api/projects/**` | **Project Service** | `http://project-service:8082` | Project CRUD, lifecycle, comments |
| `/api/escrow/**` | **Escrow Service** | `http://escrow-service:8083` | Wallets, fund locking, transactions |

**Gateway filter chain (per route):**

```
Request → RateLimiter → JwtCookieExtraction → CsrfValidation → HeaderPropagation → LoadBalancer → Service
```

---

## Auth Service — `/api/auth`

Internal service: `auth-service:8081`

---

### 1. POST `/api/auth/register`

**Register a new user account.**

| Attribute | Value |
|---|---|
| **Role required** | `NONE` (public) |

**Request body:**

```json
{
  "email": "alice@example.com",
  "password": "S3cure!Pass",
  "fullName": "Alice Johnson",
  "role": "EMPLOYER"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | `string` | ✅ | Valid email, unique |
| `password` | `string` | ✅ | Min 8 chars, 1 uppercase, 1 digit, 1 special |
| `fullName` | `string` | ✅ | 2–100 characters |
| `role` | `string` | ✅ | `EMPLOYER` or `FREELANCER` |

**Success response — `201 Created`:**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "alice@example.com",
  "fullName": "Alice Johnson",
  "role": "EMPLOYER",
  "createdAt": "2025-06-15T10:00:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Validation error (blank fields, weak password) |
| `409` | Email already registered |

**Notes:**
- On successful registration, the Escrow Service is called internally to auto-create a wallet (via synchronous REST or event).

---

### 2. POST `/api/auth/login`

**Authenticate and receive a JWT in an HttpOnly cookie.**

| Attribute | Value |
|---|---|
| **Role required** | `NONE` (public) |

**Request body:**

```json
{
  "email": "alice@example.com",
  "password": "S3cure!Pass"
}
```

| Field | Type | Required |
|---|---|---|
| `email` | `string` | ✅ |
| `password` | `string` | ✅ |

**Success response — `200 OK`:**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "alice@example.com",
  "fullName": "Alice Johnson",
  "role": "EMPLOYER"
}
```

**Response headers/cookies set:**

| Cookie/Header | Value |
|---|---|
| `Set-Cookie: tv_access=<JWT>` | `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900` |
| `Set-Cookie: tv_refresh=<token>` | `HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=604800` |
| `Set-Cookie: XSRF-TOKEN=<csrf>` | `Secure; SameSite=Strict; Path=/` (readable by JS) |

**Error responses:**

| Status | Cause |
|---|---|
| `401` | Invalid email or password |

---

### 3. POST `/api/auth/refresh`

**Refresh the access token using the refresh token cookie.**

| Attribute | Value |
|---|---|
| **Role required** | `NONE` (refresh cookie must be present) |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "message": "Token refreshed"
}
```

A new `tv_access` cookie is set in the response.

**Error responses:**

| Status | Cause |
|---|---|
| `401` | Missing or expired refresh token |

---

### 4. POST `/api/auth/logout`

**Clear authentication cookies (log out).**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "message": "Logged out successfully"
}
```

All auth cookies (`tv_access`, `tv_refresh`, `XSRF-TOKEN`) are cleared via `Max-Age=0`.

**Error responses:**

| Status | Cause |
|---|---|
| `401` | No active session |

---

### 5. GET `/api/auth/me`

**Get the currently authenticated user's profile.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "alice@example.com",
  "fullName": "Alice Johnson",
  "role": "EMPLOYER",
  "createdAt": "2025-06-15T10:00:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `401` | Not authenticated |

---

## Project Service — `/api/projects`

Internal service: `project-service:8082`

---

### 1. POST `/api/projects`

**Create a new project.**

| Attribute | Value |
|---|---|
| **Role required** | `EMPLOYER` |

**Request body:**

```json
{
  "title": "Build Landing Page",
  "description": "Create a responsive landing page with React and Tailwind CSS.",
  "budgetAmount": 1500.00,
  "currency": "USD",
  "deadlineDays": 14
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | `string` | ✅ | 5–200 characters |
| `description` | `string` | ✅ | 10–5000 characters |
| `budgetAmount` | `decimal` | ✅ | > 0, max 2 decimal places |
| `currency` | `string` | ✅ | ISO 4217 code (e.g., `USD`, `EUR`) |
| `deadlineDays` | `int` | ✅ | 1–365 |

**Success response — `201 Created`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "title": "Build Landing Page",
  "description": "Create a responsive landing page with React and Tailwind CSS.",
  "budgetAmount": 1500.00,
  "currency": "USD",
  "deadlineDays": 14,
  "status": "DRAFT",
  "employerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "freelancerId": null,
  "createdAt": "2025-06-15T10:05:00Z",
  "updatedAt": "2025-06-15T10:05:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Validation error |
| `403` | User is not an EMPLOYER |

---

### 2. GET `/api/projects`

**List projects (role-filtered).**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `int` | `0` | Page number (zero-indexed) |
| `size` | `int` | `20` | Page size (max 100) |
| `status` | `string` | — | Filter by status (e.g., `FUNDED`, `IN_PROGRESS`) |
| `sort` | `string` | `createdAt,desc` | Sort field and direction |

**Behavior by role:**

| Role | Visible projects |
|---|---|
| `EMPLOYER` | Only projects owned by the employer (all statuses) |
| `FREELANCER` | Projects with status `FUNDED` (the open market) + projects they have accepted/are working on |

**Success response — `200 OK`:**

```json
{
  "content": [
    {
      "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
      "title": "Build Landing Page",
      "budgetAmount": 1500.00,
      "currency": "USD",
      "status": "FUNDED",
      "employerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "freelancerId": null,
      "createdAt": "2025-06-15T10:05:00Z"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

---

### 3. GET `/api/projects/{id}`

**Get full project detail.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Path parameter:**

| Param | Type | Description |
|---|---|---|
| `id` | `UUID` | Project ID |

**Success response — `200 OK`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "title": "Build Landing Page",
  "description": "Create a responsive landing page with React and Tailwind CSS.",
  "budgetAmount": 1500.00,
  "currency": "USD",
  "deadlineDays": 14,
  "status": "IN_PROGRESS",
  "employerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "employerName": "Alice Johnson",
  "freelancerId": "b12cd20c-69dd-5483-b678-1f13c3d4e590",
  "freelancerName": "Bob Smith",
  "createdAt": "2025-06-15T10:05:00Z",
  "updatedAt": "2025-06-16T14:30:00Z",
  "deadline": "2025-06-29T10:05:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `404` | Project not found |
| `403` | FREELANCER trying to view a DRAFT project they don't own |

**Notes:**
- Employers can see their own projects in any status.
- Freelancers can only see `FUNDED` (market) projects or projects they are assigned to.

---

### 4. PUT `/api/projects/{id}`

**Update a project (only in DRAFT state).**

| Attribute | Value |
|---|---|
| **Role required** | `EMPLOYER` (project owner) |

**Request body:**

```json
{
  "title": "Build Landing Page v2",
  "description": "Updated requirements...",
  "budgetAmount": 2000.00,
  "currency": "USD",
  "deadlineDays": 21
}
```

All fields are optional; only provided fields are updated.

**Success response — `200 OK`:**

Returns the full updated project object (same shape as GET `/api/projects/{id}`).

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Validation error |
| `403` | Not the project owner |
| `404` | Project not found |
| `409` | Project is not in `DRAFT` status |

---

### 5. DELETE `/api/projects/{id}`

**Delete a project (only in DRAFT state).**

| Attribute | Value |
|---|---|
| **Role required** | `EMPLOYER` (project owner) |

**Request body:** *None*

**Success response — `204 No Content`**

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Not the project owner |
| `404` | Project not found |
| `409` | Project is not in `DRAFT` status |

---

### 6. POST `/api/projects/{id}/fund`

**Trigger funding — transitions the project from `DRAFT` → `FUNDED`.**

| Attribute | Value |
|---|---|
| **Role required** | `EMPLOYER` (project owner) |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "status": "FUNDED",
  "escrowTransactionId": "txn-001-lock-abc",
  "message": "Funds locked successfully. Project is now visible to freelancers."
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Not the project owner |
| `409` | Project is not in `DRAFT` status |
| `402` | Insufficient wallet balance (Escrow Service returned failure) |
| `500` | Escrow Service unreachable |

**Notes:**
- This endpoint makes a **synchronous REST call** to the Escrow Service (`POST /api/escrow/fund-lock`) to lock funds equal to `budgetAmount` from the employer's wallet.
- If the Escrow call fails, the project remains in `DRAFT` and the error is propagated.

---

### 7. POST `/api/projects/{id}/accept`

**Freelancer accepts a funded project — transitions `FUNDED` → `IN_PROGRESS`.**

| Attribute | Value |
|---|---|
| **Role required** | `FREELANCER` |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "status": "IN_PROGRESS",
  "freelancerId": "b12cd20c-69dd-5483-b678-1f13c3d4e590",
  "message": "You have accepted the project. Deadline starts now."
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | User is not a FREELANCER |
| `409` | Project is not in `FUNDED` status (already accepted by another freelancer) |
| `404` | Project not found |

**Notes:**
- Only one freelancer can accept a project. First-come, first-served with optimistic locking.

---

### 8. POST `/api/projects/{id}/submit`

**Freelancer submits completed work — transitions `IN_PROGRESS` → `IN_REVIEW`.**

| Attribute | Value |
|---|---|
| **Role required** | `FREELANCER` (assigned freelancer) |

**Request body:**

```json
{
  "submissionNote": "Work is complete. Please review the deployed URL: https://example.com",
  "attachmentUrls": [
    "https://storage.trustvault.io/files/abc123.zip"
  ]
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `submissionNote` | `string` | ✅ | 10–2000 characters |
| `attachmentUrls` | `string[]` | ❌ | Valid URLs, max 10 |

**Success response — `200 OK`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "status": "IN_REVIEW",
  "message": "Work submitted. Waiting for employer review."
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Not the assigned freelancer |
| `409` | Project is not in `IN_PROGRESS` status |

---

### 9. POST `/api/projects/{id}/approve`

**Employer approves submitted work — transitions `IN_REVIEW` → `SETTLED`.**

| Attribute | Value |
|---|---|
| **Role required** | `EMPLOYER` (project owner) |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "status": "SETTLED",
  "message": "Project approved. Funds will be released to the freelancer."
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Not the project owner |
| `409` | Project is not in `IN_REVIEW` status |

**Notes:**
- On approval, the Project Service **publishes a `ProjectSettledEvent`** to Kafka:
  ```json
  {
    "eventType": "PROJECT_SETTLED",
    "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
    "employerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "freelancerId": "b12cd20c-69dd-5483-b678-1f13c3d4e590",
    "amount": 1500.00,
    "currency": "USD",
    "occurredAt": "2025-06-20T09:00:00Z"
  }
  ```
- The **Escrow Service** consumes this event and transfers locked funds from escrow to the freelancer's wallet.

---

### 10. POST `/api/projects/{id}/dispute`

**Either party opens a dispute — transitions to `DISPUTED`.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (project owner OR assigned freelancer) |

**Request body:**

```json
{
  "reason": "The delivered work does not match the agreed requirements.",
  "evidenceUrls": [
    "https://storage.trustvault.io/files/evidence001.png"
  ]
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `reason` | `string` | ✅ | 20–2000 characters |
| `evidenceUrls` | `string[]` | ❌ | Valid URLs, max 10 |

**Valid source statuses:** `IN_PROGRESS`, `IN_REVIEW`

**Success response — `200 OK`:**

```json
{
  "id": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "status": "DISPUTED",
  "message": "Dispute opened. An administrator will review."
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Not the project owner or assigned freelancer |
| `409` | Project is not in `IN_PROGRESS` or `IN_REVIEW` status |

**Notes:**
- Disputes freeze the escrow. Funds remain locked until manual resolution by an admin.

---

### 11. GET `/api/projects/{id}/comments`

**List comments on a project.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (project owner OR assigned freelancer) |

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `int` | `0` | Page number |
| `size` | `int` | `50` | Page size (max 100) |

**Success response — `200 OK`:**

```json
{
  "content": [
    {
      "id": "c01-comment-uuid",
      "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
      "authorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "authorName": "Alice Johnson",
      "body": "Please use the updated brand colors.",
      "createdAt": "2025-06-17T08:00:00Z"
    }
  ],
  "page": 0,
  "size": 50,
  "totalElements": 1,
  "totalPages": 1
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Not a participant of this project |
| `404` | Project not found |

---

### 12. POST `/api/projects/{id}/comments`

**Add a comment to a project.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (project owner OR assigned freelancer) |

**Request body:**

```json
{
  "body": "Please use the updated brand colors."
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `body` | `string` | ✅ | 1–2000 characters |

**Success response — `201 Created`:**

```json
{
  "id": "c02-comment-uuid",
  "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "authorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "authorName": "Alice Johnson",
  "body": "Please use the updated brand colors.",
  "createdAt": "2025-06-17T08:15:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Empty or too-long comment body |
| `403` | Not a participant of this project |
| `404` | Project not found |

---

## Escrow Service — `/api/escrow`

Internal service: `escrow-service:8083`

---

### 1. POST `/api/escrow/accounts`

**Create a wallet for the current user.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Request body:**

```json
{
  "currency": "USD"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `currency` | `string` | ❌ | ISO 4217 code, defaults to `USD` |

**Success response — `201 Created`:**

```json
{
  "walletId": "w-f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "userId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "balance": 0.00,
  "currency": "USD",
  "createdAt": "2025-06-15T10:00:05Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `409` | Wallet already exists for this user |

**Notes:**
- A wallet is **auto-created** upon user registration (triggered by Auth Service). This endpoint exists as a fallback for manual creation or multi-currency wallets.

---

### 2. GET `/api/escrow/balance`

**Get the current user's wallet balance.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "walletId": "w-f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "availableBalance": 5000.00,
  "lockedBalance": 1500.00,
  "totalBalance": 6500.00,
  "currency": "USD"
}
```

| Field | Description |
|---|---|
| `availableBalance` | Funds available for new escrow locks |
| `lockedBalance` | Funds currently locked in active projects |
| `totalBalance` | `availableBalance + lockedBalance` |

**Error responses:**

| Status | Cause |
|---|---|
| `404` | No wallet found for user |

---

### 3. POST `/api/escrow/fund-lock`

**Lock funds for a project in escrow.**

| Attribute | Value |
|---|---|
| **Role required** | `INTERNAL` — Service-to-service only |

**Request body:**

```json
{
  "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "employerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "amount": 1500.00,
  "currency": "USD"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `projectId` | `UUID` | ✅ | The project to lock funds for |
| `employerId` | `UUID` | ✅ | The employer whose wallet to debit |
| `amount` | `decimal` | ✅ | Amount to lock (must be > 0) |
| `currency` | `string` | ✅ | Must match wallet currency |

**Success response — `200 OK`:**

```json
{
  "transactionId": "txn-001-lock-abc",
  "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "type": "FUND_LOCK",
  "amount": 1500.00,
  "status": "COMPLETED",
  "createdAt": "2025-06-15T10:10:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Invalid amount or currency mismatch |
| `402` | Insufficient available balance |
| `404` | Employer wallet not found |
| `409` | Funds already locked for this project |

**⚠️ Notes:**
- **This endpoint is NOT exposed to the frontend.** It is called internally by the Project Service during the `/fund` workflow.
- The API Gateway blocks external access to this path via a route filter.
- Authenticated via a service-to-service token (shared secret or mTLS).

---

### 4. POST `/api/escrow/refund/{projectId}`

**Refund locked funds back to the employer's wallet.**

| Attribute | Value |
|---|---|
| **Role required** | `INTERNAL` — Service-to-service only / Admin |

**Path parameter:**

| Param | Type | Description |
|---|---|---|
| `projectId` | `UUID` | The project whose locked funds to refund |

**Request body:** *None*

**Success response — `200 OK`:**

```json
{
  "transactionId": "txn-002-refund-abc",
  "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "type": "REFUND",
  "amount": 1500.00,
  "refundedTo": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "COMPLETED",
  "createdAt": "2025-06-15T12:00:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `404` | No locked funds found for this project |
| `409` | Funds already released or refunded |

**⚠️ Notes:**
- **This endpoint is NOT exposed to the frontend.** It is called internally for:
  - DRAFT rollback (employer deletes a funded project — edge case)
  - DISPUTED resolution (admin triggers refund)
- Protected by service-to-service authentication.

---

### 5. GET `/api/escrow/transactions`

**List the current user's transaction history.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (any role) |

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `int` | `0` | Page number |
| `size` | `int` | `20` | Page size (max 100) |
| `type` | `string` | — | Filter: `FUND_LOCK`, `RELEASE`, `REFUND`, `DEPOSIT`, `WITHDRAWAL` |
| `from` | `string` | — | ISO-8601 date-time lower bound |
| `to` | `string` | — | ISO-8601 date-time upper bound |

**Success response — `200 OK`:**

```json
{
  "content": [
    {
      "id": "txn-001-lock-abc",
      "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
      "type": "FUND_LOCK",
      "amount": -1500.00,
      "balanceAfter": 3500.00,
      "description": "Escrow lock for project: Build Landing Page",
      "createdAt": "2025-06-15T10:10:00Z"
    },
    {
      "id": "txn-000-deposit-xyz",
      "projectId": null,
      "type": "DEPOSIT",
      "amount": 5000.00,
      "balanceAfter": 5000.00,
      "description": "Wallet top-up",
      "createdAt": "2025-06-14T08:00:00Z"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 2,
  "totalPages": 1
}
```

**Notes:**
- Negative `amount` = funds leaving wallet. Positive = funds entering.
- Employers see `FUND_LOCK`, `REFUND`, `DEPOSIT`, `WITHDRAWAL`.
- Freelancers see `RELEASE`, `DEPOSIT`, `WITHDRAWAL`.

---

### 6. GET `/api/escrow/transactions/{id}`

**Get a single transaction detail.**

| Attribute | Value |
|---|---|
| **Role required** | `AUTHENTICATED` (transaction owner) |

**Path parameter:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | Transaction ID |

**Success response — `200 OK`:**

```json
{
  "id": "txn-001-lock-abc",
  "projectId": "a23bc10b-58cc-4372-a567-0e02b2c3d480",
  "projectTitle": "Build Landing Page",
  "type": "FUND_LOCK",
  "amount": -1500.00,
  "balanceAfter": 3500.00,
  "currency": "USD",
  "description": "Escrow lock for project: Build Landing Page",
  "counterparty": null,
  "createdAt": "2025-06-15T10:10:00Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `403` | Transaction does not belong to the current user |
| `404` | Transaction not found |

---

## Project Lifecycle State Machine

```
                ┌──────────────────────────────────────────────┐
                │                                              │
                ▼                                              │
  ┌───────┐  fund   ┌────────┐  accept  ┌─────────────┐       │
  │ DRAFT │───────▶ │ FUNDED │────────▶ │ IN_PROGRESS │       │
  └───────┘         └────────┘          └──────┬──────┘       │
      │                                        │              │
   delete                                   submit            │
      │                                        │              │
      ▼                                        ▼              │
  (deleted)                              ┌───────────┐        │
                                         │ IN_REVIEW │        │
                                         └─────┬─────┘        │
                                               │              │
                                ┌──────────────┼──────────┐   │
                                │              │          │   │
                             approve        dispute    dispute│
                                │              │          │   │
                                ▼              ▼          │   │
                          ┌─────────┐   ┌──────────┐     │   │
                          │ SETTLED │   │ DISPUTED │◀────┘   │
                          └─────────┘   └──────────┘         │
                                               │             │
                                          (admin resolve)    │
                                           refund/release    │
                                               │             │
                                               └─────────────┘
```

### State Transition Summary

| From | To | Trigger Endpoint | Who |
|---|---|---|---|
| `DRAFT` | `FUNDED` | `POST /api/projects/{id}/fund` | Employer |
| `DRAFT` | *(deleted)* | `DELETE /api/projects/{id}` | Employer |
| `FUNDED` | `IN_PROGRESS` | `POST /api/projects/{id}/accept` | Freelancer |
| `IN_PROGRESS` | `IN_REVIEW` | `POST /api/projects/{id}/submit` | Freelancer |
| `IN_PROGRESS` | `DISPUTED` | `POST /api/projects/{id}/dispute` | Either party |
| `IN_REVIEW` | `SETTLED` | `POST /api/projects/{id}/approve` | Employer |
| `IN_REVIEW` | `DISPUTED` | `POST /api/projects/{id}/dispute` | Either party |

### Kafka Events

| Event | Published By | Consumed By | Trigger |
|---|---|---|---|
| `ProjectSettledEvent` | Project Service | Escrow Service | Project approved → `SETTLED` |

The Escrow Service, upon consuming `ProjectSettledEvent`, transfers the locked funds from the escrow hold to the freelancer's available balance and creates a `RELEASE` transaction record.

---

*Last updated: 2025-06-15*
