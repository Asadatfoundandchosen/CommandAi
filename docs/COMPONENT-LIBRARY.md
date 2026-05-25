# Component library (Tailwind + Shadcn/UI)

1CommandAI uses **Tailwind CSS** (`tailwind.config.js`, `darkMode: 'class'`) and **Shadcn/UI** primitives (Radix + CVA) under `src/components/`.

## Structure

```text
src/components/
├── ui/              # Shadcn primitives (Button, Input, Card, Dialog, …)
├── forms/           # react-hook-form helpers (TextFormField, FormActions)
├── layout/          # AppShell, PageHeader, ThemeProvider, ThemeToggle
├── data-display/    # DataTable, StatCard
└── *.tsx            # Feature screens (LoginPage, UsageDashboard, …)
```

Config: `components.json` (Shadcn CLI aliases). Utilities: `cn()` in `src/lib/utils.ts`.

## Dark mode

`ThemeProvider` (`next-themes`) sets `class="dark"` on `<html>`. Use `ThemeToggle` in the app shell header, or:

```tsx
import { useTheme } from 'next-themes';
const { setTheme } = useTheme();
setTheme('dark'); // 'light' | 'system'
```

Brand palette: `text-brand-500`, `bg-brand-50`, `dark:bg-brand-900` (see `tailwind.config.js`).

## UI primitives (`@/components/ui`)

### Button

```tsx
import { Button } from '@/components/ui/button';

<Button>Save</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="destructive">Delete</Button>
```

### Input

```tsx
import { Input } from '@/components/ui/input';

<Input placeholder="Email" type="email" />
```

### Card

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Credits</CardTitle>
    <CardDescription>Org pool balance</CardDescription>
  </CardHeader>
  <CardContent>12,400</CardContent>
</Card>
```

### Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm</DialogTitle>
    </DialogHeader>
    <p className="text-sm text-muted-foreground">Are you sure?</p>
  </DialogContent>
</Dialog>
```

### Dropdown

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost">Actions</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => {}}>Export</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Toast (Sonner)

`Toaster` is mounted in `src/main.tsx`. Trigger from anywhere:

```tsx
import { toast } from 'sonner';

toast.success('Policy saved');
toast.error('Request failed');
```

### Table

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
```

Prefer `DataTable` in `@/components/data-display` for typed columns.

### Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="usage">Usage</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">…</TabsContent>
</Tabs>
```

### Form (react-hook-form + Zod)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { TextFormField, FormActions } from '@/components/forms';

const schema = z.object({ email: z.string().email() });

function ProfileForm() {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => console.log(v))} className="space-y-4 max-w-md">
        <TextFormField control={form.control} name="email" label="Email" />
        <FormActions>
          <Button type="submit">Save</Button>
        </FormActions>
      </form>
    </Form>
  );
}
```

## Layout (`@/components/layout`)

```tsx
import { AppShell, PageHeader } from '@/components/layout';

<AppShell>
  <PageHeader title="Usage" description="Credits by account" actions={<Button>Export</Button>} />
  {/* page content */}
</AppShell>
```

## Data display (`@/components/data-display`)

```tsx
import { DataTable, StatCard } from '@/components/data-display';

<StatCard label="Available credits" value="8,200" hint="Org pool" />

<DataTable
  title="Users"
  columns={[
    { key: 'email', header: 'Email', cell: (row) => row.email },
    { key: 'role', header: 'Role', cell: (row) => row.role },
  ]}
  data={users}
/>
```

## Adding more Shadcn components

```bash
npx shadcn@latest add select
```

Uses `components.json` aliases. New files land in `src/components/ui/`.

## Styling conventions

- Use `cn()` to merge Tailwind classes: `cn('p-4', className)`.
- Prefer semantic tokens: `bg-background`, `text-muted-foreground`, `border-border`.
- Feature screens should compose from `ui/`, `layout/`, `forms/`, and `data-display/` rather than raw HTML where possible.
