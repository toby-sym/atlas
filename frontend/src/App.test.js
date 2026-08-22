import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Tom Nook chat shell', () => {
  render(<App />);
  expect(screen.getByText(/Tom Nook/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /clear chat/i })).toBeInTheDocument();
});
