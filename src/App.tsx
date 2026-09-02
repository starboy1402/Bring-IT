import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import BrowseRequestsPage from './pages/BrowseRequestsPage'
import CreateRequestPage from './pages/CreateRequestPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import RequestDetailPage from './pages/RequestDetailPage'
import SignupPage from './pages/SignupPage'

function protectedPage(page: React.ReactNode) {
  return <ProtectedRoute>{page}</ProtectedRoute>
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={protectedPage(<HomePage />)} />
        <Route path="/requests" element={protectedPage(<BrowseRequestsPage />)} />
        <Route path="/requests/new" element={protectedPage(<CreateRequestPage />)} />
        <Route path="/requests/:id" element={protectedPage(<RequestDetailPage />)} />
      </Routes>
      <BottomNav />
    </>
  )
}
