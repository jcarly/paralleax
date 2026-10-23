import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

export function TestDataRouter({
  initialEntry,
  children,
}: {
  initialEntry: string;
  children: ReactNode;
}) {
  return (
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: children }], {
        initialEntries: [initialEntry],
      })}
    />
  );
}
