import { api } from '../api';

export type DepartmentSummary = {
  id: string;
  name: string;
  account_id?: string;
  org_id?: string;
};

type ListDepartmentsResponse = {
  data: DepartmentSummary[];
};

export const departmentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listDepartments: builder.query<DepartmentSummary[], void>({
      query: () => 'departments',
      transformResponse: (response: ListDepartmentsResponse) => response.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Department' as const, id })),
              { type: 'Department', id: 'LIST' },
            ]
          : [{ type: 'Department', id: 'LIST' }],
    }),
    getDepartment: builder.query<DepartmentSummary, string>({
      query: (id) => `departments/${id}`,
      transformResponse: (response: { data: DepartmentSummary }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Department', id }],
    }),
  }),
});

export const {
  useListDepartmentsQuery,
  useGetDepartmentQuery,
  useLazyGetDepartmentQuery,
} = departmentsApi;
