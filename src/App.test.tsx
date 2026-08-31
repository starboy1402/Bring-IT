import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App smoke test', () => {
  it('renders the BringIt home page', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'BringIt' })).toBeInTheDocument()
    expect(
      screen.getByText('Campus peer-to-peer delivery for CUET students'),
    ).toBeInTheDocument()
  })
})