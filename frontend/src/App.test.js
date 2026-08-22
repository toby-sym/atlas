import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Atlas chat shell', () => {
  render(<App />);
  expect(screen.getByText('ATLAS')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /clear session/i })).toBeInTheDocument();
});