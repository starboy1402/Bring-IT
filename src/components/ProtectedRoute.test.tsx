import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { useAuth, type OwnProfile } from '../context/AuthContext'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockUseAuth = vi.mocked(useAuth)

const profile: OwnProfile = {
  id: 'p1',
  display_name: 'Alice',
  student_id: null,
  department: null,
  hall: null,
  phone: null,
  is_verified: true,
  is_suspended: false,
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <p>protected content</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/onboarding" element={<p>onboarding page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProtectedRoute', () => {
  it('shows children for an authenticated user with a profile', () => {
    mockUseAuth.mockReturnValue({
      session: {} as never,
      profile,
      loading: false,
      refreshProfile: async () => {},
      signOut: async () => {},
    })
    renderAt('/')
    expect(screen.getByText('protected content')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to /login', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      profile: null,
      loading: false,
      refreshProfile: async () => {},
      signOut: async () => {},
    })
    renderAt('/')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('redirects authenticated users without a profile to /onboarding', () => {
    mockUseAuth.mockReturnValue({
      session: {} as never,
      profile: null,
      loading: false,
      refreshProfile: async () => {},
      signOut: async () => {},
    })
    renderAt('/')
    expect(screen.getByText('onboarding page')).toBeInTheDocument()
  })

  it('shows a loading state while the session is being restored', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      profile: null,
      loading: true,
      refreshProfile: async () => {},
      signOut: async () => {},
    })
    renderAt('/')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })
})
