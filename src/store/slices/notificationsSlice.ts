import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AppNotification,
  type NotificationPreferences,
} from '@/types/notifications';

const MAX_NOTIFICATIONS = 100;

export type NotificationsState = {
  items: AppNotification[];
  preferences: NotificationPreferences;
};

const initialState: NotificationsState = {
  items: [],
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<AppNotification>) => {
      state.items.unshift(action.payload);
      if (state.items.length > MAX_NOTIFICATIONS) {
        state.items.length = MAX_NOTIFICATIONS;
      }
    },
    markNotificationRead: (state, action: PayloadAction<string>) => {
      const item = state.items.find((n) => n.id === action.payload);
      if (item) {
        item.read = true;
      }
    },
    markAllNotificationsRead: (state) => {
      for (const item of state.items) {
        item.read = true;
      }
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((n) => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.items = [];
    },
    setNotificationPreferences: (state, action: PayloadAction<NotificationPreferences>) => {
      state.preferences = action.payload;
    },
    hydrateNotificationPreferences: (state, action: PayloadAction<NotificationPreferences>) => {
      state.preferences = action.payload;
    },
  },
});

export const {
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  removeNotification,
  clearNotifications,
  setNotificationPreferences,
  hydrateNotificationPreferences,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
