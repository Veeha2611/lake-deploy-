import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home as HomeIcon, LayoutDashboard, MessageSquare, Settings, LogOut, Sun, Moon, Briefcase } from 'lucide-react';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';

function LayoutContent({ children, currentPageName }) {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();

  const allNavItems = [
    { name: 'Home', icon: HomeIcon, page: 'Home' },
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'Intelligence Console', icon: MessageSquare, page: 'Console' },
    { name: 'Projects', icon: Briefcase, page: 'Projects' },
    { name: 'MAC App Engine', icon: Settings, page: 'MACAppEngine' },
  ];

  const navItems = allNavItems;

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <style>{`
        :root {
          --mac-sky: #C5E4ED;
          --mac-mountain: #7B8B8E;
          --mac-green: #5C7B5F;
          --mac-forest: #3D5A3D;
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
            src="/mac-mountain-logo.png"
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
                        ? 'bg-[var(--mac-sky)] text-[var(--mac-forest)] border border-[var(--mac-panel-border)] shadow-sm font-semibold'
                        : 'text-muted-foreground hover:bg-[var(--mac-table-row-hover)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium text-sm">{item.name}</span>
                  </Link>
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
            onClick={logout}
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
