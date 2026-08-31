# BringIt – Extensive Planning Document

## 1. Project Overview

BringIt is a peer-to-peer delivery platform for the CUET campus community. It connects students who need items delivered (requesters) with students who are already traveling (deliverers), creating a trusted, low-cost delivery network.

**Tech Stack:**
- Frontend: React 19, React Router v7, Vite, Tailwind CSS v4
- Backend: Supabase (PostgreSQL, Auth, Realtime, Storage)
- Deployment: Vercel
- Icons: Lucide React

---

## 2. Architecture Decision Records (ADRs)

### ADR-001: Use Supabase as Backend Platform

**Status:** Accepted  
**Date:** 2026-08-31

#### Context

We need a backend that provides authentication, database, real-time capabilities, and file storage. The team needs to move quickly with minimal DevOps overhead.

#### Decision Drivers

- Must support JWT-based authentication
- Must provide PostgreSQL database
- Must support real-time WebSocket connections
- Should include file storage
- Should be free-tier friendly for student deployment
- Team familiarity with Supabase ecosystem

#### Considered Options

| Option | Pros | Cons |
|--------|------|------|
| Supabase | Auth + Postgres + Realtime + Storage in one, free tier, PostgreSQL native | Vendor lock-in, limited query customization |
| Firebase | Mature, generous free tier, real-time built-in | NoSQL (Firestore), less familiar to team |
| Custom Node + Postgres | Full control, familiar stack | More DevOps work, slower deployment |
| AWS Amplify | Enterprise-grade, scalable | Complex, overkill for student project |

#### Decision

Use **Supabase** as the backend platform.

#### Rationale

Supabase provides all required capabilities (auth, database, realtime, storage) with minimal configuration. PostgreSQL familiarity and the free tier make it ideal for a student project.

#### Consequences

**Positive:**
- Rapid development with integrated services
- PostgreSQL for complex queries and reporting
- Built-in real-time for chat and status updates
- Free tier sufficient for student user base

**Negative:**
- Vendor lock-in for Supabase-specific features
- Limited customization compared to custom backend
- Realtime has some limitations (see ADR-003)

#### Implementation Notes

- Use Supabase Auth for JWT-based authentication
- Use Supabase Realtime for delivery status updates and chat
- Use Supabase Storage for profile images and request attachments
- Use PostgreSQL RLS (Row Level Security) for data protection

---

### ADR-002: Use React 19 + React Router v7 + Vite

**Status:** Accepted  
**Date:** 2026-08-31

#### Context

We need a modern frontend framework for building a responsive, mobile-first web application.

#### Decision Drivers

- Must support modern React patterns (hooks, context)
- Must have excellent mobile support
- Should have fast development experience
- Should support React Router for navigation
- Should be well-documented and widely adopted

#### Considered Options

| Option | Pros | Cons |
|--------|------|------|
| React 19 + Vite | Latest React, fast dev server, modern tooling | React 19 still new |
| Next.js | SSR/SSG, great DX, built-in routing | Overkill for this project, adds complexity |
| React 18 + CRA | Stable, well-known | CRA deprecated, slower than Vite |

#### Decision

Use **React 19 with React Router v7 and Vite**.

#### Rationale

React 19 provides the latest features and performance improvements. Vite offers the fastest development experience. React Router v7 is the standard routing solution for React.

#### Consequences

**Positive:**
- Fastest development experience with Vite HMR
- Modern React patterns and APIs
- Excellent ecosystem support
- Mobile-first responsive design with Tailwind

**Negative:**
- React 19 is relatively new (some libraries may lag)
- Need to learn Vite-specific configurations

#### Implementation Notes

- Use Vite for build tooling and dev server
- Use React Router v7 for client-side routing
- Use Tailwind CSS v4 for styling
- Use `clsx` and `tailwind-merge` for conditional styling

---

### ADR-003: Use Supabase Realtime for Live Features

**Status:** Accepted  
**Date:** 2026-08-31

#### Context

The application requires real-time status updates, in-app notifications, and instant messaging between requesters and deliverers.

#### Decision Drivers

- Must support live status updates for delivery requests
- Must support real-time chat between users
- Should be integrated with the existing Supabase stack
- Should handle connection drops gracefully

#### Considered Options

| Option | Pros | Cons |
|--------|------|------|
| Supabase Realtime | Integrated with Postgres, WebSocket-based | Limited customization, broadcast channels |
| Socket.io | Full control, mature, fallback support | Need custom backend, more code |
| Pusher | Managed service, reliable | Cost, external dependency |
| Firebase Realtime DB | Managed, real-time | NoSQL, different from Postgres |

#### Decision

Use **Supabase Realtime** for live features.

#### Rationale

Supabase Realtime integrates seamlessly with PostgreSQL and requires no additional backend infrastructure. It's sufficient for the scale of this project.

#### Consequences

**Positive:**
- No additional backend services needed
- PostgreSQL triggers can broadcast changes
- Built-in presence and broadcast channels

**Negative:**
- Limited to Supabase's real-time capabilities
- Connection management requires custom handling
- Scale limits for very high concurrent users

#### Implementation Notes

- Use `useRealtime` hooks for delivery status subscriptions
- Implement presence tracking for online users
- Handle reconnection logic with exponential backoff
- Use broadcast channels for chat messages

---

### ADR-004: Rule-Based Matching with Weighted Scoring

**Status:** Accepted  
**Date:** 2026-08-31

#### Context

The platform needs to intelligently match delivery requests with suitable travelers based on route, timing, and reliability.

#### Decision Drivers

- Must work without historical data (day-one functionality)
- Must be transparent and explainable
- Should be deterministic for consistent results
- Should be computationally efficient

#### Considered Options

| Option | Pros | Cons |
|--------|------|------|
| Rule-based weighted scoring | Works day one, deterministic, explainable | May not be as accurate as ML |
| Machine learning model | Can learn from data, potentially more accurate | Requires data, complex, overkill |
| Simple open feed | Easy to implement | No intelligence, poor UX |

#### Decision

Use **rule-based weighted scoring formula**:

```
Score = w1·RouteOverlap + w2·TimeWindowOverlap + w3·UrgencyWeight + w4·TravelerRating
```

#### Rationale

This deterministic formula works correctly from day one with no historical data. It's transparent, explainable, and computationally efficient.

#### Consequences

**Positive:**
- Works immediately without training data
- Transparent scoring logic
- Easy to debug and adjust weights
- Computationally efficient

**Negative:**
- May not capture complex patterns that ML could
- Requires careful weight tuning
- Static formula may need manual updates

#### Implementation Notes

- `RouteOverlap`: Distance-based overlap between traveler's route and request pickup/drop-off
- `TimeWindowOverlap`: Compatibility between request timing and traveler's schedule
- `UrgencyWeight`: High/Medium/Low urgency multiplier
- `TravelerRating`: Normalized credibility score (0-1)
- Default weights: w1=0.4, w2=0.3, w3=0.2, w4=0.1
- Store weights in database for easy tuning

---

## 3. API Design (RESTful + Supabase)

### 3.1 Authentication Endpoints

Supabase Auth handles these natively:
- `POST /auth/v1/signup` - User registration
- `POST /auth/v1/token` - User login
- `POST /auth/v1/logout` - User logout
- `GET /auth/v1/user` - Get current user

### 3.2 Delivery Requests (CRUD)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/rest/v1/delivery_requests` | List all open requests | No |
| `GET` | `/rest/v1/delivery_requests?id=eq.{id}` | Get specific request | No |
| `POST` | `/rest/v1/delivery_requests` | Create new request | Yes |
| `PATCH` | `/rest/v1/delivery_requests?id=eq.{id}` | Update request | Yes (owner) |
| `DELETE` | `/rest/v1/delivery_requests?id=eq.{id}` | Delete request | Yes (owner) |

### 3.3 Delivery Request Status Flow

```
Open → Accepted → In Progress → Delivered
```

Status transitions:
- `Open` → `Accepted`: Deliverer accepts the request
- `Accepted` → `In Progress`: Deliverer marks as picked up
- `In Progress` → `Delivered`: Deliverer confirms delivery
- Any → `Cancelled`: Requester or deliverer cancels

### 3.4 Real-time Subscriptions

```typescript
// Subscribe to delivery request status changes
const channel = supabase
  .channel('delivery-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'delivery_requests',
    filter: `id=eq.${requestId}`
  }, (payload) => {
    console.log('Status changed:', payload.new.status);
  })
  .subscribe();
```

### 3.5 Chat Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/rest/v1/messages?request_id=eq.{id}` | Get messages for a request |
| `POST` | `/rest/v1/messages` | Send a message |

Real-time: Subscribe to `messages` table for `INSERT` events filtered by `request_id`.

---

## 4. Database Schema

### 4.1 Core Tables

#### `profiles`
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  department TEXT,
  hall TEXT,
  phone TEXT,
  credibility_score FLOAT DEFAULT 0,
  total_deliveries INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `delivery_requests`
```sql
CREATE TABLE delivery_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  item_description TEXT,
  urgency TEXT CHECK (urgency IN ('High', 'Medium', 'Low')),
  reward_suggestion FLOAT,
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Accepted', 'In Progress', 'Delivered', 'Cancelled')),
  deliverer_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `deliveries`
```sql
CREATE TABLE deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES delivery_requests(id) NOT NULL,
  deliverer_id UUID REFERENCES profiles(id) NOT NULL,
  status TEXT DEFAULT 'Accepted' CHECK (status IN ('Accepted', 'In Progress', 'Delivered', 'Cancelled')),
  rating INT CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `messages`
```sql
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES delivery_requests(id) NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `leaderboard`
```sql
CREATE TABLE leaderboard (
  user_id UUID REFERENCES profiles(id) PRIMARY KEY,
  points INT DEFAULT 0,
  rank INT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all, update own
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Delivery requests: Anyone can read open, only owner can modify
CREATE POLICY "Open requests are viewable by everyone"
  ON delivery_requests FOR SELECT USING (status = 'Open' OR requester_id = auth.uid() OR deliverer_id = auth.uid());
CREATE POLICY "Users can create requests"
  ON delivery_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Only requester can update request"
  ON delivery_requests FOR UPDATE USING (auth.uid() = requester_id);

-- Messages: Participants can read, authenticated can send
CREATE POLICY "Participants can read messages"
  ON messages FOR SELECT USING (
    request_id IN (
      SELECT id FROM delivery_requests WHERE requester_id = auth.uid() OR deliverer_id = auth.uid()
    )
  );
CREATE POLICY "Authenticated users can send messages"
  ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
```

---

## 5. Testing Strategy (TDD Approach)

### 5.1 Test Pyramid

```
        /\
       /  \     E2E Tests (Playwright)
      /----\
     /      \   Integration Tests (Vitest + React Testing Library)
    /--------\
   /          \ Unit Tests (Vitest)
  /------------\
```

### 5.2 Unit Tests

**Frontend Components:**
- Component rendering and props
- User interactions (clicks, form submissions)
- State management (context providers)
- Utility functions

**Backend/Edge Functions:**
- Matching algorithm logic
- Scoring calculations
- Data transformations
- Validation functions

### 5.3 Integration Tests

- Component + Context integration
- Supabase client mocking
- API route handlers
- Database query functions

### 5.4 E2E Tests (Playwright)

- User registration and login flow
- Request creation flow
- Request acceptance flow
- Chat messaging flow
- Leaderboard display

### 5.5 TDD Workflow

For each feature:

1. **RED:** Write failing test
2. **Verify RED:** Confirm test fails for expected reason
3. **GREEN:** Write minimal code to pass
4. **Verify GREEN:** Confirm test passes, other tests pass
5. **REFACTOR:** Clean up code, keep tests green
6. **Repeat:** Next feature

### 5.6 Example TDD Cycle

**RED:**
```typescript
test('calculates route overlap score correctly', () => {
  const travelerRoute = [{lat: 23.7, lng: 90.4}, {lat: 23.8, lng: 90.5}];
  const requestPoints = {pickup: {lat: 23.75, lng: 90.45}, dropoff: {lat: 23.85, lng: 90.55}};
  
  const score = calculateRouteOverlap(travelerRoute, requestPoints);
  
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThanOrEqual(1);
});
```

**GREEN:**
```typescript
function calculateRouteOverlap(route: Point[], request: RequestPoints): number {
  // Minimal implementation to pass test
  return 0.7;
}
```

**REFACTOR:**
```typescript
function calculateRouteOverlap(route: Point[], request: RequestPoints): number {
  const pickupDist = Math.min(...route.map(p => haversineDistance(p, request.pickup)));
  const dropoffDist = Math.min(...route.map(p => haversineDistance(p, request.dropoff)));
  const avgDist = (pickupDist + dropoffDist) / 2;
  return Math.max(0, 1 - avgDist / MAX_CAMPUS_DISTANCE);
}
```

---

## 6. Frontend Architecture

### 6.1 Directory Structure

```
src/
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── Footer.tsx
│   ├── delivery/
│   │   ├── DeliveryCard.tsx
│   │   ├── DeliveryList.tsx
│   │   ├── DeliveryForm.tsx
│   │   └── DeliveryStatus.tsx
│   ├── chat/
│   │   ├── ChatWindow.tsx
│   │   └── MessageList.tsx
│   └── leaderboard/
│       ├── LeaderboardTable.tsx
│       └── UserRank.tsx
├── contexts/
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   └── RealtimeContext.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useRealtime.ts
│   └── useMatching.ts
├── pages/
│   ├── Home.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── CreateRequest.tsx
│   ├── RequestDetail.tsx
│   ├── Chat.tsx
│   ├── Leaderboard.tsx
│   └── Profile.tsx
├── lib/
│   ├── supabase.ts
│   ├── matching.ts
│   └── utils.ts
├── styles/
│   └── globals.css
├── App.tsx
└── main.tsx
```

### 6.2 State Management

- **Auth:** `AuthContext` with Supabase Auth
- **Theme:** `ThemeContext` for dark/light mode
- **Realtime:** `RealtimeContext` for subscriptions
- **Local State:** React `useState`/`useReducer` for component state

### 6.3 Routing Structure

```typescript
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
  <Route path="/requests/create" element={<ProtectedRoute><CreateRequest /></ProtectedRoute>} />
  <Route path="/requests/:id" element={<ProtectedRoute><RequestDetail /></ProtectedRoute>} />
  <Route path="/chat/:requestId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
  <Route path="/leaderboard" element={<Leaderboard />} />
  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
</Routes>
```

---

## 7. Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Set up project structure, authentication, and database

- [x] Initialize Vite + React + TypeScript project
- [ ] Set up Tailwind CSS v4
- [ ] Configure Supabase client
- [ ] Implement AuthContext with login/signup
- [ ] Create profile creation flow
- [ ] Set up database schema with RLS policies
- [ ] Implement protected routes

### Phase 2: Core Features (Weeks 3-4)

**Goal:** Delivery request CRUD and status tracking

- [ ] Create delivery request form (title, description, locations, urgency)
- [ ] Implement delivery request list with filtering
- [ ] Build request detail view
- [ ] Implement status flow (Open → Accepted → In Progress → Delivered)
- [ ] Add request acceptance flow
- [ ] Implement request cancellation

### Phase 3: Real-time & Communication (Weeks 5-6)

**Goal:** Real-time updates and chat functionality

- [ ] Implement real-time status updates with `useRealtime`
- [ ] Build chat interface between requester and deliverer
- [ ] Add in-app notifications
- [ ] Implement presence tracking
- [ ] Handle reconnection logic

### Phase 4: Matching & Gamification (Weeks 7-8)

**Goal:** Rule-based matching and leaderboard

- [ ] Implement scoring algorithm
  - [ ] Route overlap calculation
  - [ ] Time window overlap
  - [ ] Urgency weighting
  - [ ] Traveler rating integration
- [ ] Build matching UI showing scored requests
- [ ] Implement leaderboard with points system
- [ ] Add points awarding on delivery completion
- [ ] Implement star-based rating system

### Phase 5: UI/UX Polish (Weeks 9-10)

**Goal:** Animations, theming, and responsive design

- [ ] Implement dark/light theme toggle
- [ ] Add Framer Motion animations
- [ ] Implement toast notifications
- [ ] Build modal dialog system
- [ ] Ensure mobile responsiveness
- [ ] Add loading states and skeletons

### Phase 6: Testing & Deployment (Weeks 11-12)

**Goal:** Comprehensive testing and production deployment

- [ ] Write unit tests for components
- [ ] Write integration tests for Supabase operations
- [ ] Write E2E tests with Playwright
- [ ] Perform user acceptance testing
- [ ] Deploy to Vercel
- [ ] Set up environment variables
- [ ] Configure production Supabase project
- [ ] Monitor and fix bugs

---

## 8. Deployment Strategy

### 8.1 Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `localhost:5173` | Local development |
| Staging | TBD | Pre-production testing |
| Production | TBD | Live deployment |

### 8.2 Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 8.3 Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## 9. Future Iterations

- Route-based matching with maps integration
- Push notifications
- In-app payment processing
- Native mobile apps (iOS/Android)
- Analytics dashboard for campus administration
- Route optimization based on historical data
- Integration with campus calendar/schedule systems

---

*Generated using Architecture Decision Records, Test-Driven Development, and API Design Principles skills.*
