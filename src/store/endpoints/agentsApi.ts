import { api } from '../api';

export type AgentSummary = {
  id: string;
  name: string;
  status?: string;
  org_id?: string;
};

type ListAgentsResponse = {
  data: AgentSummary[];
};

/** Agent registry endpoints (extend when backend module ships). */
export const agentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listAgents: builder.query<AgentSummary[], void>({
      query: () => 'v1/agents',
      transformResponse: (response: ListAgentsResponse) => response.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Agent' as const, id })),
              { type: 'Agent', id: 'LIST' },
            ]
          : [{ type: 'Agent', id: 'LIST' }],
    }),
    getAgent: builder.query<AgentSummary, string>({
      query: (id) => `v1/agents/${id}`,
      transformResponse: (response: { data: AgentSummary }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Agent', id }],
    }),
  }),
});

export const { useListAgentsQuery, useGetAgentQuery, useLazyGetAgentQuery } = agentsApi;
