import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth, type OwnProfile } from './context/AuthContext'
import App from './App'

vi.mock('./context/AuthContext', () => ({
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

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    session: {} as never,
    profile,
    loading: false,
    refreshProfile: async () => {},
    signOut: async () => {},
  })
})

describe('App smoke test', () => {
  it('renders the BringIt home page for an authenticated user', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'BringIt' })).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
