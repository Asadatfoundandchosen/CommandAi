import { api } from '../api';

export type SignalSummary = {
  id: string;
  title?: string;
  status?: string;
  org_id?: string;
  created_at?: string;
};

type ListSignalsResponse = {
  data: SignalSummary[];
};

/** Signal feed endpoints (extend when backend module ships). */
export const signalsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listSignals: builder.query<SignalSummary[], void>({
      query: () => 'v1/signals',
      transformResponse: (response: ListSignalsResponse) => response.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Signal' as const, id })),
              { type: 'Signal', id: 'LIST' },
            ]
          : [{ type: 'Signal', id: 'LIST' }],
    }),
    getSignal: builder.query<SignalSummary, string>({
      query: (id) => `v1/signals/${id}`,
      transformResponse: (response: { data: SignalSummary }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Signal', id }],
    }),
  }),
});

export const { useListSignalsQuery, useGetSignalQuery, useLazyGetSignalQuery } = signalsApi;
