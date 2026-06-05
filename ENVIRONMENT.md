# Environment Configuration

## Development

VITE_BETA_URL=http://localhost:3000

## Production

Set `VITE_BETA_URL` to the deployed beta app origin when it is live.

Marketing site env:

```env
VITE_BETA_URL=https://beta.usevoxa.tech
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `VITE_` or
`NEXT_PUBLIC_`.

The `/developers/access` form posts to `/api/developer-access`, which inserts rows into
`public.developer_access_requests`. Before deploying the form, run:

```sql
supabase/developer-access-requests.sql
```

in the Supabase SQL Editor.
