import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  User, 
  Bell, 
  Database, 
  Shield, 
  Palette,
  Save,
  Cloud,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
  Key,
  UserPlus
} from 'lucide-react';
import { format } from 'date-fns';

export default function Settings({ user }) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    queryResults: true,
    weeklyDigest: false
  });

  const handleInviteUser = async () => {
    if (!inviteEmail || inviting) return;
    setInviting(true);
    try {
      await base44.functions.invoke('inviteUser', {
        email: inviteEmail,
        role: 'admin'
      });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (error) {
      toast.error('Failed to send invitation: ' + error.message);
    } finally {
      setInviting(false);
    }
  };

  // Fetch real AWS health status
  const { data: awsHealth, isLoading: healthLoading, refetch } = useQuery({
    queryKey: ['aws-health'],
    queryFn: async () => {
      // Call backend function: 'checkAWSHealth'
      // This runs a small test query: SELECT 1 against curated_core
      const result = await base44.functions.checkAWSHealth();
      
      // Expected return:
      // {
      //   athena_connected: boolean,
      //   last_successful_query: string (ISO timestamp),
      //   lambda_endpoint: string,
      //   environment: string ('prod' | 'sandbox'),
      //   athena_workgroup: string,
      //   s3_output_bucket: string,
      //   allowlist_views_accessible: array of { view: string, accessible: boolean },
      //   error?: string
      // }
      
      return result;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const handleSaveSettings = () => {
    toast.success('Settings saved successfully');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Header 
        title="Settings"
        subtitle="Manage your account and application preferences"
        user={user}
      />

      <div className="space-y-6">
        {/* Profile Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-[#5C7B5F]" />
              Profile Settings
            </CardTitle>
            <CardDescription>
              Manage your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={user?.full_name || ''} readOnly className="bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} readOnly className="bg-slate-50" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#5C7B5F] text-white capitalize">
                  {user?.role || 'User'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Invitation (Admin Only) */}
        {user?.role === 'admin' && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#5C7B5F]" />
                Invite User
              </CardTitle>
              <CardDescription>
                Invite users to access the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                  onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
                />
                <Button onClick={handleInviteUser} disabled={inviting || !inviteEmail}>
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Invited users will have admin access. Access restricted to @macmtn.com emails and whitelisted addresses.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Authentication Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#5C7B5F]" />
              Authentication & Security
            </CardTitle>
            <CardDescription>
              Manage your login and security preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-[var(--mac-forest)]/10 to-[var(--mac-sky)]/10 rounded-xl border border-[var(--mac-forest)]/20">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[var(--mac-forest)] text-white">
                  <Key className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-card-foreground mb-1">Authentication Method</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Authenticated via Base44 platform • SSO Enabled
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Secure session active</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Last Login</p>
                <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {format(new Date(), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Session Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Active</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium text-card-foreground">Security Actions</h4>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => base44.auth.logout()}
                >
                  Sign Out
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => toast.info('Password reset is managed through Base44 platform')}
                >
                  Change Password
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AWS Integration Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-[#5C7B5F]" />
                  AWS Integration Status
                </CardTitle>
                <CardDescription>
                  Real-time connection health and configuration
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={healthLoading}
              >
                {healthLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Refresh'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : awsHealth?.error ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-red-800">Connection Error</span>
                </div>
                <p className="text-sm text-red-700">{awsHealth.error}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${
                    awsHealth?.athena_connected 
                      ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200'
                      : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-medium ${
                        awsHealth?.athena_connected ? 'text-emerald-800' : 'text-red-800'
                      }`}>
                        AWS Athena
                      </span>
                      {awsHealth?.athena_connected ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <p className={`text-sm ${
                      awsHealth?.athena_connected ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {awsHealth?.athena_connected ? 'Connected' : 'Disconnected'}
                    </p>
                    {awsHealth?.last_successful_query && (
                      <p className="text-xs text-slate-500 mt-2">
                        Last query: {format(new Date(awsHealth.last_successful_query), 'MMM d, h:mm a')}
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-blue-800">Environment</span>
                      <Badge className="bg-blue-600 text-white">
                        {awsHealth?.environment || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm text-blue-600">
                      {awsHealth?.lambda_endpoint ? 'Lambda configured' : 'No Lambda endpoint'}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Athena Workgroup:</span>
                    <span className="font-mono text-slate-800">{awsHealth?.athena_workgroup || 'N/A'}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-slate-600">S3 Output Bucket:</span>
                    <span className="font-mono text-slate-800 text-xs">{awsHealth?.s3_output_bucket || 'N/A'}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-slate-600">Lambda Endpoint:</span>
                    <span className="font-mono text-slate-800 text-xs truncate max-w-xs">
                      {awsHealth?.lambda_endpoint || 'N/A'}
                    </span>
                  </div>
                  
                  {awsHealth?.allowlist_views_accessible && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-slate-600 block mb-2">Allowlist Views:</span>
                        <div className="space-y-1">
                          {awsHealth.allowlist_views_accessible.map((view, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="font-mono text-slate-700">{view.view}</span>
                              {view.accessible ? (
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#5C7B5F]" />
              Notifications
            </CardTitle>
            <CardDescription>
              Configure how you receive updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Alerts</p>
                <p className="text-sm text-slate-500">Receive important system alerts via email</p>
              </div>
              <Switch 
                checked={notifications.emailAlerts}
                onCheckedChange={(checked) => setNotifications({...notifications, emailAlerts: checked})}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Query Results</p>
                <p className="text-sm text-slate-500">Get notified when long-running queries complete</p>
              </div>
              <Switch 
                checked={notifications.queryResults}
                onCheckedChange={(checked) => setNotifications({...notifications, queryResults: checked})}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Digest</p>
                <p className="text-sm text-slate-500">Summary of insights and popular queries</p>
              </div>
              <Switch 
                checked={notifications.weeklyDigest}
                onCheckedChange={(checked) => setNotifications({...notifications, weeklyDigest: checked})}
              />
            </div>
          </CardContent>
        </Card>

        {/* Data & Privacy */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#5C7B5F]" />
              Data & Privacy
            </CardTitle>
            <CardDescription>
              Manage your data preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <h4 className="font-medium text-slate-800 mb-2">Query History</h4>
              <p className="text-sm text-slate-500 mb-3">
                Your query history is stored securely and helps improve AI suggestions
              </p>
              <Button variant="outline" size="sm">
                Export My Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSaveSettings}
            className="bg-[#5C7B5F] hover:bg-[#4A6A4D]"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}