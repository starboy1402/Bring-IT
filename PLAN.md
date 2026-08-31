# BringIt Project Plan

## 1. Project Overview
BringIt is a campus-focused peer-to-peer delivery platform for CUET students. It connects students who need items delivered with students who are already traveling on campus or to/from the city. The aim is to create a low-cost, trust-based delivery network that reduces the need for expensive commercial courier services for small everyday tasks.

### Core Goals
- Help students request items quickly and cheaply
- Let students earn or gain reputation by delivering items on their route
- Create a trusted campus delivery network using student identity and reputation
- Provide real-time tracking and communication during each delivery
- Keep the system simple, scalable, and deployable with minimal DevOps cost

---

## 2. Problem Statement
Campus life creates small but frequent delivery needs such as:
- food pickup
- documents or lab reports
- medicine or stationery
- parcels from campus gates or nearby stores
- items between halls, departments, and faculties

Students often do not have time to travel, while other students are already moving through the same route. BringIt turns these everyday movements into useful delivery opportunities.

---

## 3. Target Users
### Requester
A student who needs an item or document delivered.

### Deliverer
A student who is already traveling and can carry an item along the route.

### System Admin / Moderator
A later-stage role for reviewing misuse, suspensions, or trust-related issues.

---

## 4. Main Features
### Must-Have MVP Features
- Student authentication and profile creation
- Request creation with pickup and dropoff points
- Request listing and filtering
- Request acceptance by a deliverer
- Delivery status tracking
- Real-time communication between requester and deliverer
- Leaderboard and reputation system
- Responsive mobile-friendly UI

### Nice-to-Have Later Features
- route-based or map-based matching
- push notifications
- reward optimization suggestions
- analytics dashboard
- admin moderation tools
- campus-specific verification enhancements

---

## 5. Proposed Tech Stack
### Frontend
- React 19
- React Router v7
- Vite
- Tailwind CSS v4
- Lucide Icons

### Backend / Database
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Realtime
- Supabase Storage

### Deployment
- Vercel

### Development Practices
- TypeScript
- TDD workflow
- component + integration testing
- environmental configuration management

---

## 6. Architecture Decision Summary
### ADR-001: Use Supabase as backend platform
Supabase provides authentication, a PostgreSQL database, storage, and realtime features all in one platform. This keeps the project fast and low-cost while still meeting all major MVP requirements.

### ADR-002: Use React + Vite frontend stack
This gives a fast development environment, mobile-friendly workflow, and modern tooling for an MVP product.

### ADR-003: Use Supabase Realtime for live updates
Live request updates and chat messaging fit naturally with Supabase Realtime.

### ADR-004: Use rule-based matching with weighted scoring
The matching system should be deterministic, explainable, and work from day one without historical data. A weighted formula is better than a complicated ML model for an early-stage student project.

---

## 7. Recommended Product Flow
1. User signs up or logs in
2. User completes profile details
3. User creates a delivery request
4. Deliverers browse available requests
5. A suitable deliverer accepts the request
6. Chat and status updates begin
7. Deliverer completes the trip and marks the request as delivered
8. Reputation points and leaderboard score are updated

---

## 8. Delivery Lifecycle
Open -> Accepted -> In Progress -> Delivered

Optional cancellation states can also be added:
- Cancelled by requester
- Cancelled by deliverer

---

## 9. Matching Model
Use a weighted rule-based score such as:

Score = w1 * RouteOverlap + w2 * TimeWindowOverlap + w3 * UrgencyWeight + w4 * TravelerRating

Suggested default weights:
- Route overlap: 0.4
- Time compatibility: 0.3
- Urgency: 0.2
- Traveler rating: 0.1

This approach is transparent, low-risk, and effective for a student-focused campus setting.

---

## 10. Data Model (High Level)
### Users / Profiles
- user id
- student id
- name
- department
- hall
- phone
- credibility score
- total deliveries

### Delivery Requests
- request id
- requester id
- pickup location
- dropoff location
- item description
- urgency
- reward suggestion
- status
- deliverer id
- timestamps

### Messages
- message id
- request id
- sender id
- content
- created at

### Deliveries / Completion Records
- delivery id
- request id
- deliverer id
- status
- rating
- feedback
- completed at

### Leaderboard
- user id
- points
- rank
- updated at

---

## 11. Implementation Plan
### Phase 1: Foundation
- initialize Vite + React app
- configure Tailwind
- set up Supabase client
- define base project structure and test setup

### Phase 2: Authentication and User Profiles
- login/signup flow
- profile onboarding
- protected routes
- basic user data handling

### Phase 3: Delivery Request System
- create request form
- request listing and filtering
- request details page
- status management
- request acceptance flow

### Phase 4: Real-Time Communication
- request updates via Realtime
- messaging between users
- notification handling

### Phase 5: Matching and Reputation
- rule-based scoring engine
- match suggestions UI
- points and delivery feedback system
- leaderboard

### Phase 6: UX and Mobile Polish
- responsive design
- theme toggle
- toast notifications
- loading states and better empty states

### Phase 7: Testing and Deployment
- unit and integration tests
- e2e smoke tests
- production deployment via Vercel
- environment variable setup and final validation

---

## 12. Testing Strategy
### TDD Workflow
For each feature:
1. Write a failing test
2. Confirm it fails for the right reason
3. Write minimal code to pass it
4. Verify all relevant tests pass
5. Refactor carefully without changing behavior

### Test Coverage Areas
- matching logic
- status transitions
- auth guards
- request form validation
- chat and realtime behavior
- leaderboard calculations

---

## 13. Risks and Challenges
- low early user adoption if there are too few active students
- route matching may feel weak without enough campus data
- trust and verification needs careful UX design
- realtime behavior may need extra handling for connection drops
- dependence on Vercel and Supabase requires good environment management

### Risk Mitigation
- keep the MVP simple and focused
- start with a trusted student-only model
- use deterministic matching and clear reward suggestions
- test core journeys before release

---

## 14. Recommended Next Steps
1. finalize the exact MVP feature set with the team
2. start front-end and Supabase scaffolding in parallel
3. implement auth and profile flow first
4. build delivery request lifecycle second
5. add real-time features after the core flow is stable
6. do testing and deployment only after MVP features work reliably

---

## 15. Final Conclusion
BringIt addresses a real campus problem: small delivery requests are frequent, but current options are expensive, impersonal, or disorganized. A student-first, trust-based peer delivery platform built with React and Supabase is a practical and scalable MVP. By focusing on the core campus workflow, strong trust, realtime updates, and a transparent matching algorithm, the project can be built quickly and evolved over time.

This plan is suitable for a student project, a team pitch, or a class submission and can be shared with teammates and supervisors.
