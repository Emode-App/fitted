import React, { useRef, useEffect } from 'react';
import { Home, Search, Plus, MessageSquare, User, Bell, Menu } from 'lucide-react';
import { SettingsDrawer } from './SettingsDrawer';

interface LayoutProps {
  children?: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenNotifications: () => void;
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  onOpenSettings: () => void;
  settingsView: 'menu' | 'editProfile';
  scrollKey?: string;
  hasUnreadNotifications?: boolean;
  currentTheme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange, 
  onOpenNotifications,
  isSettingsOpen,
  onCloseSettings,
  onOpenSettings,
  settingsView,
  scrollKey,
  hasUnreadNotifications,
  currentTheme,
  setTheme
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [scrollKey]);

  return (
    <div className="flex flex-col h-screen w-full bg-white dark:bg-black text-slate-900 dark:text-white relative overflow-hidden transition-colors duration-200">
      {/* Settings Drawer */}
      <SettingsDrawer 
        isOpen={isSettingsOpen} 
        onClose={onCloseSettings} 
        initialView={settingsView}
        currentTheme={currentTheme}
        setTheme={setTheme}
      />

      {/* Top Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100 dark:border-zinc-800 shrink-0 z-10 bg-white dark:bg-black/95 backdrop-blur-sm">
        {/* Left: Notification Bell */}
        <button onClick={onOpenNotifications} className="p-2 -ml-2 text-gray-800 dark:text-white relative hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full transition-colors">
          <Bell size={24} strokeWidth={1.5} />
          {hasUnreadNotifications && (
            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-black"></div>
          )}
        </button>
        
        <div className="font-black text-3xl tracking-tighter drop-shadow-sm text-black dark:text-white">FITTED.</div>
        
        {/* Right: Settings / Menu */}
        <button onClick={onOpenSettings} className="p-2 -mr-2 text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full transition-colors">
          <Menu size={24} strokeWidth={1.5} />
        </button>
      </div>

      {/* Main Content Area */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto hide-scrollbar w-full bg-white dark:bg-black relative"
      >
        {children}
      </div>

      {/* Bottom Navigation */}
      <div className="h-20 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between px-6 pb-4 bg-white dark:bg-black shrink-0 z-10 w-full">
        <button onClick={() => onTabChange('home')} className={`p-2 transition-colors ${activeTab === 'home' ? 'text-black dark:text-white' : 'text-gray-400 dark:text-zinc-600'}`}>
           <Home size={28} strokeWidth={activeTab === 'home' ? 2.5 : 1.5} />
        </button>
        <button onClick={() => onTabChange('explore')} className={`p-2 transition-colors ${activeTab === 'explore' ? 'text-black dark:text-white' : 'text-gray-400 dark:text-zinc-600'}`}>
           <Search size={28} strokeWidth={activeTab === 'explore' ? 2.5 : 1.5} />
        </button>
        
        {/* Center Add Button */}
        <button 
          onClick={() => onTabChange('create')} 
          className="w-12 h-12 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black shadow-lg shadow-black/20 dark:shadow-white/10 active:scale-95 transition-transform"
        >
           <Plus size={28} strokeWidth={3} />
        </button>
        
        <button onClick={() => onTabChange('messages')} className={`p-2 transition-colors ${activeTab === 'messages' ? 'text-black dark:text-white' : 'text-gray-400 dark:text-zinc-600'}`}>
           <MessageSquare size={28} strokeWidth={activeTab === 'messages' ? 2.5 : 1.5} />
        </button>
        <button onClick={() => onTabChange('profile')} className={`p-2 transition-colors ${activeTab === 'profile' ? 'text-black dark:text-white' : 'text-gray-400 dark:text-zinc-600'}`}>
           <User size={28} strokeWidth={activeTab === 'profile' ? 2.5 : 1.5} />
        </button>
      </div>
    </div>
  );
};