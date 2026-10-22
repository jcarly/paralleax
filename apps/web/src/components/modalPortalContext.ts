import { createContext, type RefObject } from 'react';

// Dialog-owned floating content must stay inside the active modal's isolation boundary.
export const ModalPortalContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
