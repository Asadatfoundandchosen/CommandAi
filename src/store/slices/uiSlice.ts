import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { QueuedAction } from '@/types';

export type UiState = {
  sidebarCollapsed: boolean;
  globalLoading: boolean;
  actionQueue: QueuedAction[];
};

const initialState: UiState = {
  sidebarCollapsed: false,
  globalLoading: false,
  actionQueue: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.globalLoading = action.payload;
    },
    setActionQueue: (state, action: PayloadAction<QueuedAction[]>) => {
      state.actionQueue = action.payload;
    },
  },
});

export const { setSidebarCollapsed, toggleSidebar, setGlobalLoading, setActionQueue } =
  uiSlice.actions;
export default uiSlice.reducer;
