import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type WebVitalName = 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';

export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

export type WebVitalSample = {
  id: string;
  name: WebVitalName;
  value: number;
  rating: WebVitalRating;
  delta: number;
  navigationType?: string;
  recordedAt: string;
  budgetExceeded: boolean;
};

export type WebVitalsState = {
  /** Latest value per metric name (current session). */
  latest: Partial<Record<WebVitalName, WebVitalSample>>;
  /** Rolling history for the performance dashboard. */
  history: WebVitalSample[];
  violations: WebVitalSample[];
};

const MAX_HISTORY = 50;

const initialState: WebVitalsState = {
  latest: {},
  history: [],
  violations: [],
};

const webVitalsSlice = createSlice({
  name: 'webVitals',
  initialState,
  reducers: {
    recordWebVital: (state, action: PayloadAction<WebVitalSample>) => {
      const sample = action.payload;
      state.latest[sample.name] = sample;
      state.history.unshift(sample);
      if (state.history.length > MAX_HISTORY) {
        state.history.length = MAX_HISTORY;
      }
      if (sample.budgetExceeded) {
        const exists = state.violations.some((v) => v.id === sample.id);
        if (!exists) {
          state.violations.unshift(sample);
          if (state.violations.length > MAX_HISTORY) {
            state.violations.length = MAX_HISTORY;
          }
        }
      }
    },
    clearWebVitals: () => initialState,
  },
});

export const { recordWebVital, clearWebVitals } = webVitalsSlice.actions;
export default webVitalsSlice.reducer;
