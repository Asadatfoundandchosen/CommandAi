import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsHome() {
  return (
    <div className="grid gap-4 md:grid-cols-2 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>MFA policy</CardTitle>
          <CardDescription>Organization MFA enforcement rules</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm text-primary hover:underline" to="/settings/mfa-policy">
            Configure MFA policy →
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Retention</CardTitle>
          <CardDescription>Audit log retention and compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm text-primary hover:underline" to="/settings/retention">
            Configure retention →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
