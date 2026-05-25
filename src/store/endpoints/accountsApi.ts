import { api } from '../api';

export type AccountSummary = {
  id: string;
  name: string;
  org_id?: string;
  is_deleted?: boolean;
};

type ListAccountsResponse = {
  data: AccountSummary[];
};

export const accountsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listAccounts: builder.query<AccountSummary[], void>({
      query: () => 'v1/accounts',
      transformResponse: (response: ListAccountsResponse) => response.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Account' as const, id })),
              { type: 'Account', id: 'LIST' },
            ]
          : [{ type: 'Account', id: 'LIST' }],
    }),
    getAccount: builder.query<AccountSummary, string>({
      query: (id) => `v1/accounts/${id}`,
      transformResponse: (response: { data: AccountSummary }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Account', id }],
    }),
  }),
});

export const { useListAccountsQuery, useGetAccountQuery, useLazyGetAccountQuery } = accountsApi;
