import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '@/types';

export type AuthState = {
  token: string | null;
  orgId: string | null;
  user: AuthUser | null;
};

const initialState: AuthState = {
  token: null,
  orgId: null,
  user: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ token: string; orgId?: string | null; user?: AuthUser | null }>,
    ) => {
      state.token = action.payload.token;
      if (action.payload.orgId !== undefined) {
        state.orgId = action.payload.orgId;
      }
      if (action.payload.user !== undefined) {
        state.user = action.payload.user;
      }
    },
    setOrgId: (state, action: PayloadAction<string | null>) => {
      state.orgId = action.payload;
    },
    setUser: (state, action: PayloadAction<AuthUser | null>) => {
      state.user = action.payload;
    },
    clearCredentials: (state) => {
      state.token = null;
      state.orgId = null;
      state.user = null;
    },
  },
});

export const { setCredentials, setOrgId, setUser, clearCredentials } = authSlice.actions;
export default authSlice.reducer;
