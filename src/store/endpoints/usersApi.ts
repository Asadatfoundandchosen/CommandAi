import { api } from '../api';

export type UserSummary = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  department_id?: string;
  account_id?: string;
};

type ListUsersResponse = {
  data: UserSummary[];
};

export const usersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query<UserSummary[], void>({
      query: () => 'users',
      transformResponse: (response: ListUsersResponse) => response.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'User' as const, id })),
              { type: 'User', id: 'LIST' },
            ]
          : [{ type: 'User', id: 'LIST' }],
    }),
    getUser: builder.query<UserSummary, string>({
      query: (id) => `users/${id}`,
      transformResponse: (response: { data: UserSummary }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),
  }),
});

export const { useListUsersQuery, useGetUserQuery, useLazyGetUserQuery } = usersApi;
