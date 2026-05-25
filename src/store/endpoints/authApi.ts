import { orgIdFromAccessToken } from '@/lib/jwt';

import { api } from '../api';
import { clearNotifications } from '../slices/notificationsSlice';
import { clearCredentials, setCredentials } from '../slices/authSlice';

export type LoginRequest = {
  email: string;
  password: string;
  org_id?: string;
  totp_code?: string;
  backup_code?: string;
  sms_code?: string;
};

export type LoginResponse = {
  accessToken: string;
  expiresIn?: number;
  tokenType?: string;
  passwordChangeRequired?: boolean;
};

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: 'v1/auth/login',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              token: data.accessToken,
              orgId: orgIdFromAccessToken(data.accessToken),
            }),
          );
        } catch {
          /* handled by mutation hook */
        }
      },
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: 'v1/auth/logout',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(clearCredentials());
          dispatch(clearNotifications());
        }
      },
    }),
    refresh: builder.mutation<LoginResponse, void>({
      query: () => ({
        url: 'v1/auth/refresh',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              token: data.accessToken,
              orgId: orgIdFromAccessToken(data.accessToken),
            }),
          );
        } catch {
          dispatch(clearCredentials());
        }
      },
    }),
  }),
});

export const { useLoginMutation, useLogoutMutation, useRefreshMutation } = authApi;
