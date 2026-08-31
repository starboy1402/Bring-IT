# BringIt Developer Task Plan

## 1. Project Objective
Build the BringIt MVP: a campus-focused delivery platform that connects students who need items delivered with students who are already traveling.

This plan breaks the work into implementation tasks for frontend, backend, testing, and deployment.

---

## 2. Team Workflow
### Recommended team split
- Frontend Developer: UI pages, routing, state, responsive design
- Backend Developer: Supabase schema, auth, data access, realtime, security rules
- Full Stack / QA: matching logic, testing, bug fixing, smoke validation
- Team Lead / PM: milestone review, decisions, final deployment checks

---

## 3. Phase-wise Developer Tasks

## Phase 1: Project Setup and Environment
### Task 1.1: Initialize frontend app
- Create React 19 + Vite app
- Set up TypeScript configuration
- Install required libraries:
  - React Router
  - Tailwind CSS
  - Lucide React
  - clsx / tailwind-merge
- Configure project folder structure

### Task 1.2: Configure styling and app shell
- Set up Tailwind CSS v4
- Create base layout and theme variables
- Add global styles and responsive utilities
- Create reusable UI container, button, input, card components

### Task 1.3: Configure Supabase integration
- Create Supabase client configuration
- Add environment variables
- Define project constants for auth and data access
- Create service layer for request and profile data

### Task 1.4: Set up testing environment
- Install Vitest, React Testing Library, and test setup
- Configure test scripts
- Add basic smoke test for app render

### Deliverables
- working project scaffold
- Supabase connection ready
- base UI shell and theme system
- testing setup running

---

## Phase 2: Authentication and User Profiles
### Task 2.1: Authentication flow
- Implement sign-up page
- Implement login page
- Implement logout behavior
- Persist session in app state
- Handle auth errors and loading states

### Task 2.2: Profile onboarding
- Create profile form with required fields
- Validate student ID and contact information
- Save profile to Supabase
- Add profile completion check before access to key actions

### Task 2.3: Protected routes
- Create authentication guard
- Restrict access to request creation and request detail pages
- Redirect unauthorized users to login

### Task 2.4: User profile page
- Show profile data
- Show delivery stats
- Show user score and trust value

### Deliverables
- functional auth screen flow
- profile creation completed
- protected user access enforced

---

## Phase 3: Delivery Request Management
### Task 3.1: Create delivery request form
Fields to include:
- title
- item description
- pickup location
- dropoff location
- urgency level
- suggested reward
- notes

### Task 3.2: Validate request data
- required field checks
- invalid location validation
- reward validation
- form submission states

### Task 3.3: Request listing screen
- show open requests
- add filters by urgency or status
- sort by newest or nearest likely route
- support empty-state UI

### Task 3.4: Request detail page
- display request metadata
- show requester profile summary
- show delivery status
- show accept button for valid deliverers

### Task 3.5: Accept and cancel flows
- allow a deliverer to accept a request
- restrict multiple acceptances
- let requester cancel before delivery starts
- enforce owner permissions

### Deliverables
- basic request creation and browsing working
- lifecycle begins from request creation to acceptance

---

## Phase 4: Delivery Lifecycle and Status Tracking
### Task 4.1: Define status model
Use this lifecycle:
- Open
- Accepted
- In Progress
- Delivered
- Cancelled

### Task 4.2: Update status transitions
- requester posts request -> Open
- deliverer accepts -> Accepted
- deliverer marks pickup -> In Progress
- deliverer marks delivery complete -> Delivered
- cancel flow from any relevant point

### Task 4.3: Restrict transitions by role
- only requester can cancel before assignment
- only assigned deliverer can update in-progress state
- only valid party can complete the delivery

### Task 4.4: Request history/log
- track status change timestamps
- present request history in UI

### Deliverables
- reliable lifecycle system
- status transitions controlled by business rules

---

## Phase 5: Real-Time Communication
### Task 5.1: Realtime request updates
- subscribe to delivery_requests changes
- listen for status updates
- refresh UI automatically when a request changes

### Task 5.2: Chat feature
- create chat table / data model
- allow messages between requester and deliverer
- subscribe to message inserts
- show newest messages first or chronologically

### Task 5.3: Notification system
- show toast or banner when request updates happen
- notify on message arrival or status change

### Task 5.4: Reconnect and error handling
- handle connection drops gracefully
- retry subscriptions safely
- show fallback state when realtime is unavailable

### Deliverables
- live status updates working
- chat between matched users functioning
- basic in-app notifications present

---

## Phase 6: Matching and Recommendation Engine
### Task 6.1: Define match score inputs
- route overlap
- time-window compatibility
- urgency level
- traveler rating

### Task 6.2: Implement matching service
- create reusable pure function for score calculation
- test edge cases with deterministic inputs
- store scoring weights in config or backend settings

### Task 6.3: Add match view in UI
- show top deliverer candidates or recommended matches
- explain score components in UI
- keep it simple and interpretable

### Task 6.4: Validate fairness
- score should not favor one user unfairly
- ensure no hidden logic or unexplained decisions

### Deliverables
- matching algorithm implemented and testable
- UI shows community-friendly recommendation logic

---

## Phase 7: Trust, Reputation, and Leaderboard
### Task 7.1: Add delivery completion rating
- allow requester to rate deliverer after completion
- allow deliverer to rate requester where relevant
- validate rating range and store in database

### Task 7.2: Update trust score
- calculate reputation points from successful deliveries
- award points for completion and reliability
- avoid unfair inflation from fake or low-quality actions

### Task 7.3: Leaderboard screen
- show top users by points
- rank system
- show user stats and badges

### Task 7.4: Profile trust summary
- display total deliveries
- display credibility score
- show delivery history

### Deliverables
- reputation and trust model working
- leaderboard displayed in user-facing UI

---

## Phase 8: UX Polish and Responsiveness
### Task 8.1: Mobile-first interface refinements
- optimize list, forms, and detail pages for phone screens
- ensure no text overflow or hidden controls
- maintain usable touch targets

### Task 8.2: Theme and style polish
- dark/light theme toggle
- consistent spacing and typography
- consistent cards and button styling

### Task 8.3: Loading and empty states
- loading skeletons or spinners
- empty cart / empty request states
- graceful error banners

### Task 8.4: Accessibility improvements
- labels for inputs
- keyboard navigation
- contrast and text readability
- focus states

### Deliverables
- final app feels clean and usable on mobile devices

---

## Phase 9: Testing and Quality Gates
### Task 9.1: Unit tests
- matching score logic
- validation helpers
- request lifecycle helpers
- utility functions

### Task 9.2: Component tests
- login page render
- request form validation
- status change buttons
- protected route behavior

### Task 9.3: Integration tests
- user creates request
- user accepts request
- status updates are saved
- message is posted and rendered

### Task 9.4: End-to-end smoke tests
- sign up/login flow
- create request
- accept request
- complete delivery
- leaderboard updates

### Deliverables
- TDD cycle followed for key features
- core user journeys verified before deployment

---

## Phase 10: Deployment and Final Release
### Task 10.1: Production configuration
- setup Vercel deployment
- configure environment variables
- verify Supabase production settings
- confirm database tables and policies are active

### Task 10.2: Production validation
- test login in production build
- test request creation and acceptance
- verify realtime behavior
- check leaderboard and trust updates

### Task 10.3: Final bug fixing
- fix UI bugs discovered in production review
- fix edge-case conditions in request lifecycle
- confirm no broken flows remain

### Deliverables
- deployed app accessible publicly
- final QA checks completed

---

## 4. Suggested Developer Task Board
### Sprint 1: Foundation
- Initialize project
- Configure styles and routes
- Set up Supabase connection
- Test infrastructure

### Sprint 2: Auth and Profiles
- sign-up/login/logout
- onboarding form
- protected routing
- profile page

### Sprint 3: Core Delivery Flow
- request form
- request listing
- detail page
- accept/cancel logic

### Sprint 4: Real-Time and Matching
- status tracking
- chat
- notifications
- matching engine

### Sprint 5: Trust and UX
- leaderboard
- reputation scoring
- mobile polish
- accessibility

### Sprint 6: Release Readiness
- tests
- bug fixes
- deployment
- final smoke check

---

## 5. Definition of Done
A feature is complete only when:
- the requirement is clearly implemented
- tests cover critical behavior
- UI works on mobile and desktop
- real-time updates behave correctly
- access control is enforced correctly
- the feature is reviewed by the team
- final verification is documented

---

## 6. Best Practices to Follow
- use TDD for each major feature
- keep matching logic explainable and deterministic
- protect data with Supabase Row Level Security
- avoid overbuilding the MVP
- write clean, readable component structure
- test real behavior, not mocks only

---

## 7. Overall Milestone Summary
### Milestone 1: MVP foundation
- app scaffold and setup
- auth and profile

### Milestone 2: Core platform
- request posting and acceptance
- lifecycle tracking

### Milestone 3: Engagement and trust
- chat, realtime, leaderboard, reputation

### Milestone 4: Release quality
- tests, bug fixes, deployment, final validation

---

## 8. Final Recommendation
The simplest and safest project sequence is:
1. Foundation
2. Auth and profiles
3. Delivery request lifecycle
4. Matching and realtime
5. Trust and leaderboard
6. Release validation

This sequence reduces risk and ensures the MVP is built in a stable, testable order.
