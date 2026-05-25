import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/** Minimal auth slice shape for prepareHeaders (avoids circular import from index). */
type AuthHeaderState = {
  auth: { token: string | null };
};

/**
 * Shared RTK Query API. Base `/api` supports both `/api/v1/*` and legacy `/api/users`, `/api/departments`.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as AuthHeaderState).auth.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['User', 'Agent', 'Signal', 'Account', 'Department'],
  endpoints: () => ({}),
});
