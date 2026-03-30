import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Cloud, CheckCircle, AlertCircle, Loader2, User, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [adminEmail, setAdminEmail] = useState('');
  const [adminStatus, setAdminStatus] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [disableOnRemove, setDisableOnRemove] = useState(false);
  const apiBase = typeof window !== 'undefined'
    ? (window.__MAC_APP_CONFIG__?.apiBaseUrl || import.meta.env.VITE_MAC_APP_API_BASE || '')
    : '';

  const { data: awsHealth, isLoading: healthLoading, refetch } = useQuery({
    queryKey: ['aws-health'],
    queryFn: async () => base44.functions.checkAWSHealth(),
    refetchInterval: 60000
  });

  const {
    data: adminUsers = [],
    isLoading: adminLoading,
    refetch: refetchAdmins
  } = useQuery({
    queryKey: ['admin-users'],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const resp = await base44.functions.adminUsers({ action: 'list' });
      const payload = resp?.data || {};
      if (payload.success === false || payload.ok === false) {
        throw new Error(payload.error || 'Admin list failed');
      }
      return payload.users || [];
    }
  });

  const runAdminAction = async (action) => {
    if (!adminEmail.trim()) {
      setAdminStatus({ type: 'error', message: 'Enter an email address.' });
      return;
    }
    setAdminBusy(true);
    setAdminStatus(null);
    try {
      const resp = await base44.functions.adminUsers({
        action,
        email: adminEmail.trim(),
        disable: action === 'remove' ? disableOnRemove : undefined
      });
      const payload = resp?.data || {};
      if (payload.success === false || payload.ok === false) {
        throw new Error(payload.error || 'Admin action failed');
      }
      setAdminStatus({ type: 'success', message: `Action ${action} completed for ${adminEmail.trim()}` });
      setAdminEmail('');
      await refetchAdmins();
    } catch (err) {
      setAdminStatus({ type: 'error', message: err?.message || 'Admin action failed' });
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Header
        title="Settings"
        subtitle="AWS-native MAC App 2.0 configuration"
        user={user}
      />

      <div className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-[var(--mac-forest)]" />
              Viewer Profile
            </CardTitle>
            <CardDescription>
              Read-only access for the AWS-hosted MAC App 2.0 preview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className="bg-[var(--mac-forest)] text-white">{user?.role || 'viewer'}</Badge>
              <span className="text-sm text-muted-foreground">{user?.full_name || 'MAC Viewer'}</span>
              <span className="text-sm text-muted-foreground">{user?.email || 'viewer@macmtn.com'}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Editing is performed in Monday. AWS remains the system of record.
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5 text-[var(--mac-forest)]" />
                    Access Administration
                  </CardTitle>
                  <CardDescription>
                    Add or remove MAC App admins (Cognito + notification email sent automatically).
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchAdmins()}
                  disabled={adminLoading}
                >
                  {adminLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <Input
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="email@macmtn.com"
                  className="md:flex-1"
                />
                <Button
                  onClick={() => runAdminAction('add')}
                  disabled={adminBusy}
                >
                  {adminBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Admin'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runAdminAction('resend')}
                  disabled={adminBusy}
                >
                  Resend Invite
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => runAdminAction('remove')}
                  disabled={adminBusy}
                >
                  Remove
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={disableOnRemove}
                  onChange={(event) => setDisableOnRemove(event.target.checked)}
                />
                Disable user after removal
              </label>
              {adminStatus && (
                <div
                  className={`text-xs rounded-lg border p-3 ${
                    adminStatus.type === 'error'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {adminStatus.message}
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 bg-slate-50 text-xs font-medium text-muted-foreground px-3 py-2">
                  <div>Email</div>
                  <div>Status</div>
                  <div>Enabled</div>
                </div>
                <div className="divide-y">
                  {(adminUsers || []).map((userRow) => (
                    <div key={userRow.username} className="grid grid-cols-3 px-3 py-2 text-sm">
                      <div className="truncate">{userRow.username}</div>
                      <div>{userRow.status}</div>
                      <div>{userRow.enabled ? 'Yes' : 'No'}</div>
                    </div>
                  ))}
                  {!adminLoading && (!adminUsers || adminUsers.length === 0) && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">No admin users found.</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-[var(--mac-forest)]" />
                  AWS Query Layer
                </CardTitle>
                <CardDescription>
                  Connection status for the MAC App V2 API
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={healthLoading}
              >
                {healthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking API health...
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                {awsHealth?.athena_connected ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">Healthy</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-700">Degraded</span>
                  </>
                )}
                <span className="text-xs text-muted-foreground">
                  {awsHealth?.last_successful_query ? `Last OK: ${awsHealth.last_successful_query}` : 'No successful queries yet'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-slate-50">
                <div className="text-xs text-muted-foreground">API Base URL</div>
                <div className="text-sm font-medium break-all flex items-center gap-2">
                  <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  {apiBase || 'Not configured'}
                </div>
              </div>
              <div className="p-4 rounded-lg border bg-slate-50">
                <div className="text-xs text-muted-foreground">Athena Output</div>
                <div className="text-sm font-medium break-all">{awsHealth?.s3_output_bucket || 's3://gwi-raw-us-east-2-pc/athena-results/'}</div>
              </div>
            </div>

            {awsHealth?.error && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {awsHealth.error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
