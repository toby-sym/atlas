import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the town bulletin chat shell', () => {
  render(<App />);
  expect(screen.getByText(/Town Bulletin/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /clear chat/i })).toBeInTheDocument();
});
