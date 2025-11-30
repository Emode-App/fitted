import React, { useState, useEffect } from 'react';
import { X, User, Lock, Bell, HelpCircle, LogOut, ChevronRight, Moon } from 'lucide-react';
import { 
  EditProfile, 
  PrivacySecurity, 
  NotificationSettings, 
  AppearanceSettings, 
  HelpSupport,
  TwoFactorAuth,
  LoginActivity,
  FAQs,
  PrivacyPolicyText,
  ContactUs
} from './SettingsPages';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'menu' | 'editProfile';
  currentTheme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}

type SettingsView = 
  | 'menu' 
  | 'editProfile' 
  | 'privacy' 
  | 'notifications' 
  | 'appearance' 
  | 'help'
  | 'twoFactor'
  | 'loginActivity'
  | 'faqs'
  | 'contact'
  | 'privacyPolicy';

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose, initialView = 'menu', currentTheme, setTheme }) => {
  const [currentView, setCurrentView] = useState<SettingsView>(initialView);

  useEffect(() => {
    if (isOpen) {
        setCurrentView(initialView);
    } else {
        const timer = setTimeout(() => setCurrentView('menu'), 300);
        return () => clearTimeout(timer);
    }
  }, [isOpen, initialView]);

  if (!isOpen) return null;

  const handleBack = () => {
    if (initialView === currentView && initialView !== 'menu') {
        onClose();
    } else {
        setCurrentView('menu');
    }
  };

  const renderContent = () => {
      switch (currentView) {
          case 'editProfile': return <EditProfile onBack={handleBack} />;
          case 'privacy': return <PrivacySecurity onBack={() => setCurrentView('menu')} onNavigate={setCurrentView} />;
          case 'twoFactor': return <TwoFactorAuth onBack={() => setCurrentView('privacy')} />;
          case 'loginActivity': return <LoginActivity onBack={() => setCurrentView('privacy')} />;
          
          case 'notifications': return <NotificationSettings onBack={() => setCurrentView('menu')} />;
          case 'appearance': return <AppearanceSettings onBack={() => setCurrentView('menu')} currentTheme={currentTheme} setTheme={setTheme} />;
          
          case 'help': return <HelpSupport onBack={() => setCurrentView('menu')} onNavigate={setCurrentView} />;
          case 'faqs': return <FAQs onBack={() => setCurrentView('help')} />;
          case 'contact': return <ContactUs onBack={() => setCurrentView('help')} />;
          case 'privacyPolicy': return <PrivacyPolicyText onBack={() => setCurrentView('help')} />;
          
          default: return (
            <>
                <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-black tracking-tight text-black dark:text-white">Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    
                    {/* Account Section */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3 px-2">Account</h3>
                        <div className="space-y-1">
                            <MenuItem icon={<User size={20} />} label="Edit Profile" onClick={() => setCurrentView('editProfile')} />
                            <MenuItem icon={<Lock size={20} />} label="Privacy & Security" onClick={() => setCurrentView('privacy')} />
                            <MenuItem icon={<Bell size={20} />} label="Notifications" onClick={() => setCurrentView('notifications')} />
                        </div>
                    </div>

                    {/* App Section */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3 px-2">App</h3>
                        <div className="space-y-1">
                            <MenuItem icon={<Moon size={20} />} label="Appearance" onClick={() => setCurrentView('appearance')} />
                            <MenuItem icon={<HelpCircle size={20} />} label="Help & Support" onClick={() => setCurrentView('help')} />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 dark:border-zinc-800">
                        <button className="w-full flex items-center gap-3 px-3 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium">
                            <LogOut size={20} />
                            <span>Log Out</span>
                        </button>
                    </div>

                </div>
                
                <div className="p-6 border-t border-gray-100 dark:border-zinc-800 text-center shrink-0">
                    <div className="text-xs text-gray-400 dark:text-zinc-600">Fitted v1.0.0</div>
                    <div className="text-[10px] text-gray-300 dark:text-zinc-700 mt-1">Powered by Nano Banana Pro</div>
                </div>
            </>
          );
      }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[85%] sm:w-[400px] bg-white dark:bg-zinc-900 z-[70] shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col overflow-hidden rounded-l-3xl border-l border-gray-100 dark:border-zinc-800">
         {renderContent()}
      </div>
    </>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void }> = ({ icon, label, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl transition-colors group">
        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 font-medium group-hover:text-black dark:group-hover:text-white">
            {icon}
            <span>{label}</span>
        </div>
        <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600 group-hover:text-gray-500 dark:group-hover:text-gray-400" />
    </button>
);