import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, MessageSquare, Settings, LogOut, Compass, Sun, Moon, AlertTriangle, Briefcase, TestTube } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TopicsModal from '@/components/topics/TopicsModal';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';

function LayoutContent({ children, currentPageName }) {
    const navigate = useNavigate();
    const [isTopicsModalOpen, setIsTopicsModalOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();
    const [unauthorized, setUnauthorized] = useState(false);
    const [user, setUser] = useState(null);
    const [hiddenPages, setHiddenPages] = useState(() => {
      const saved = localStorage.getItem('hiddenNavPages');
      return saved ? JSON.parse(saved) : [];
    });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        const allowedEmails = ['patrick.cochran@icloud.com'];
        const isAllowed = currentUser?.email?.endsWith('@macmtn.com') || 
                         allowedEmails.includes(currentUser?.email);

        if (currentUser && !isAllowed) {
          setUnauthorized(true);
          setTimeout(() => {
            base44.auth.logout();
          }, 3000);
        }

        // Check Architecture page access
        if (currentUser && currentPageName === 'Architecture' && currentUser.email !== 'patrick.cochran@icloud.com') {
          setUnauthorized(true);
          setTimeout(() => {
            navigate(createPageUrl('Dashboard'));
          }, 1000);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
    };
    checkAuth();
  }, []);

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border-2 border-red-500 rounded-xl p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-card-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-4">
            Only authorized users can access this application.
          </p>
          <p className="text-sm text-muted-foreground">
            Logging you out...
          </p>
        </div>
      </div>
    );
  }
  
  const patrickOnlyPages = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'].includes(user?.email?.toLowerCase());

  const allNavItems = [
            { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
            { name: 'Intelligence Console', icon: MessageSquare, page: 'Console' },
            { name: 'Topics', icon: Compass, page: 'Topics' },
            { name: 'Projects', icon: Briefcase, page: 'Projects' },
            ...(patrickOnlyPages ? [
              { name: 'SSOT Test Pack', icon: TestTube, page: 'SSOTTestPack' },
              { name: 'MAC App Engine', icon: Settings, page: 'MACAppEngine' },
              { name: 'Revenue Repro', icon: Settings, page: 'RevenueReproPack' },
              { name: 'Architecture', icon: Settings, page: 'Architecture' }
            ] : []),
          ];

  const navItems = allNavItems.filter(item => !hiddenPages.includes(item.page));

  const togglePageVisibility = (pageName) => {
    setHiddenPages(prev => {
      const updated = prev.includes(pageName) 
        ? prev.filter(p => p !== pageName)
        : [...prev, pageName];
      localStorage.setItem('hiddenNavPages', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <style>{`
        :root {
          --mac-sky: #B8D8E5;
          --mac-mountain: #7B8B8E;
          --mac-forest: #5C7B5F;
          --mac-dark: #2D3E2D;
        }

        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }

        .animate-shimmer {
          animation: shimmer 3s infinite linear;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%
          );
          background-size: 1000px 100%;
        }
      `}</style>
      
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex flex-col transition-colors duration-300">
        {/* Logo */}
        <div className="p-6 border-b border-border transition-colors duration-300">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69481f6c123954e1473c4004/e02ac2d4f_image.png" 
            alt="Mac Mountain" 
            className="h-16 w-auto mx-auto"
          />
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              return (
                <div key={item.page} className="group relative">
                  <Link
                    to={createPageUrl(item.page)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] text-white shadow-md'
                        : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium text-sm">{item.name}</span>
                  </Link>
                  <button
                    onClick={() => togglePageVisibility(item.page)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600 transition-all"
                  >
                    Hide
                  </button>
                </div>
              );
            })}


        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2 transition-colors duration-300">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            <span className="font-medium">{theme === 'light' ? 'Dark' : 'Light'} Mode</span>
          </button>
          <Link
            to={createPageUrl('Settings')}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </Link>
          <button
            onClick={() => base44.auth.logout()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="ml-64 min-h-screen bg-background transition-colors duration-300">
        {children}
      </main>

      {/* Topics Modal */}
      <TopicsModal 
        isOpen={isTopicsModalOpen}
        onClose={() => setIsTopicsModalOpen(false)}
      />
      </div>
      );
      }

      export default function Layout({ children, currentPageName }) {
      return (
      <ThemeProvider>
      <LayoutContent children={children} currentPageName={currentPageName} />
      </ThemeProvider>
      );
      }