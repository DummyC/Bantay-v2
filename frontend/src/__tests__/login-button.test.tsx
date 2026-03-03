import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login'

describe('Login page', () => {
  it('shows the Sign in button text', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    )

    const signInButton = screen.getByRole('button', { name: /^Sign in$/ })
    expect(signInButton).toBeInTheDocument()
    expect(signInButton).toHaveTextContent('Sign in')
  })
})