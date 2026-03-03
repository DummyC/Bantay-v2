import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App routing', () => {
  it('renders landing page call-to-action by default', () => {
    window.history.pushState({}, '', '/')
    render(<App />)

    expect(screen.getByText(/Coastal Safety Platform/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /login/i }).length).toBeGreaterThan(0)
  })

  it('renders login page when navigating to /login', () => {
    window.history.pushState({}, '', '/login')
    render(<App />)

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})