import React, { useState, useEffect } from 'react';
import { ArrowLeft, Camera, ChevronRight, Moon, Sun, Monitor, Shield, Eye, Lock, Bell, MessageSquare, Heart, UserPlus, HelpCircle, Mail, FileText, Image as ImageIcon, Instagram, Twitter, Music, Tag, Smartphone, QrCode, MapPin, Laptop, Plus, Minus, ChevronDown, CheckCircle, Send } from 'lucide-react';
import { CURRENT_USER } from '../constants';
import { getUser, updateUser } from '../services/mockDb';
import { Button } from './Shared';

interface SubPageProps {
  onBack: () => void;
  onNavigate?: (view: any) => void;
}

// Reusable Toggle Component
const ToggleItem = ({ 
  label, 
  description, 
  icon: Icon, 
  checked, 
  onChange,
  defaultValue = false 
}: { 
  label: string, 
  description?: string, 
  icon?: any, 
  checked?: boolean,
  onChange?: (val: boolean) => void,
  defaultValue?: boolean 
}) => {
  const [internalState, setInternalState] = useState(defaultValue);
  
  const isChecked = checked !== undefined ? checked : internalState;
  
  const handleClick = () => {
    const newValue = !isChecked;
    if (onChange) {
        onChange(newValue);
    } else {
        setInternalState(newValue);
    }
  };

  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-50 dark:border-zinc-800 last:border-0 gap-4">
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        {Icon && <div className="text-gray-400 dark:text-zinc-500 shrink-0"><Icon size={20} /></div>}
        <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{label}</div>
            {description && <div className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5 leading-snug truncate">{description}</div>}
        </div>
      </div>
      <button 
        onClick={handleClick}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 text-white ${isChecked ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-zinc-700'}`}
      >
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white dark:bg-black rounded-full transition-transform ${isChecked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
};

// --- EDIT PROFILE ---
export const EditProfile: React.FC<SubPageProps> = ({ onBack }) => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    bio: '',
    location: '',
    avatarUrl: '',
    headerUrl: '',
    instagram: '',
    twitter: '',
    favoriteBrand: '',
    songTitle: '',
    songArtist: '',
    songUrl: ''
  });

  useEffect(() => {
    const user = getUser(CURRENT_USER.id);
    if (user) {
        setFormData({
            name: user.username, 
            username: user.handle.replace('@', ''),
            bio: user.bio,
            location: user.location,
            avatarUrl: user.avatarUrl,
            headerUrl: user.headerUrl || '',
            instagram: user.socials?.instagram || '',
            twitter: user.socials?.twitter || '',
            favoriteBrand: user.favoriteBrand || '',
            songTitle: user.favoriteSong?.title || '',
            songArtist: user.favoriteSong?.artist || '',
            songUrl: user.favoriteSong?.url || ''
        });
    }
  }, []);

  const handleSave = () => {
    const user = getUser(CURRENT_USER.id);
    if (user) {
        updateUser({
            ...user,
            username: formData.name, 
            handle: `@${formData.username}`,
            bio: formData.bio,
            location: formData.location,
            avatarUrl: formData.avatarUrl,
            headerUrl: formData.headerUrl,
            socials: {
                instagram: formData.instagram,
                twitter: formData.twitter
            },
            favoriteBrand: formData.favoriteBrand,
            favoriteSong: formData.songTitle ? {
                title: formData.songTitle,
                artist: formData.songArtist,
                url: formData.songUrl
            } : undefined
        });
    }
    onBack();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'avatarUrl' | 'headerUrl') => {
    if (e.target.files && e.target.files[0]) {
        const url = URL.createObjectURL(e.target.files[0]);
        setFormData(prev => ({ ...prev, [field]: url }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
        <span className="font-bold text-lg">Edit Profile</span>
        <button className="text-blue-600 dark:text-blue-400 font-bold text-sm" onClick={handleSave}>Save</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-0 pb-10">
        {/* Header & Avatar Edit Section */}
        <div className="relative mb-16">
            {/* Header Image */}
            <div className="h-32 bg-gray-200 dark:bg-zinc-800 relative group overflow-hidden">
                {formData.headerUrl && <img src={formData.headerUrl} className="w-full h-full object-cover opacity-80" alt="header" />}
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors flex items-center justify-center cursor-pointer">
                    <label className="cursor-pointer flex flex-col items-center gap-1">
                        <div className="bg-black/50 p-2 rounded-full text-white backdrop-blur-sm">
                            <ImageIcon size={20} />
                        </div>
                        <input type="file" className="hidden" onChange={(e) => handleImageUpload(e, 'headerUrl')} accept="image/*" />
                    </label>
                </div>
            </div>

            {/* Avatar Image */}
            <div className="absolute -bottom-12 left-4">
                <div className="relative group cursor-pointer">
                    <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden border-4 border-white dark:border-zinc-900 shadow-sm">
                        <img src={formData.avatarUrl} alt="avatar" className="w-full h-full object-cover opacity-90 group-hover:opacity-75 transition-opacity" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                         <label className="cursor-pointer bg-black/30 p-2 rounded-full text-white backdrop-blur-sm hover:bg-black/50 transition-colors">
                            <Camera size={20} />
                            <input type="file" className="hidden" onChange={(e) => handleImageUpload(e, 'avatarUrl')} accept="image/*" />
                        </label>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-5 px-6 pb-6 border-b border-gray-50 dark:border-zinc-800">
            <div>
                <label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-1.5 block">Display Name</label>
                <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-1.5 block">Username</label>
                <input 
                    type="text" 
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-1.5 block">Bio</label>
                <textarea 
                    value={formData.bio}
                    onChange={e => setFormData({...formData, bio: e.target.value})}
                    rows={3}
                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white resize-none text-black dark:text-white"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-1.5 block">Location</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={formData.location}
                        onChange={e => setFormData({...formData, location: e.target.value})}
                        className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                    />
                </div>
            </div>
        </div>

        {/* Favorites Section */}
        <div className="px-6 py-6 space-y-5 border-b border-gray-50 dark:border-zinc-800">
             <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Favorites</h3>
             <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Tag size={18} /></div>
                <input 
                    type="text" 
                    placeholder="Favorite Brand (e.g. Rick Owens)"
                    value={formData.favoriteBrand}
                    onChange={e => setFormData({...formData, favoriteBrand: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                />
             </div>
             
             <div className="space-y-3 p-4 bg-gray-50 dark:bg-zinc-800 rounded-2xl border border-gray-100 dark:border-zinc-700">
                <div className="flex items-center gap-2 text-gray-400 dark:text-zinc-500 text-xs font-bold uppercase mb-1">
                    <Music size={14} /> <span>Featured Song</span>
                </div>
                <input 
                    type="text" 
                    placeholder="Song Title"
                    value={formData.songTitle}
                    onChange={e => setFormData({...formData, songTitle: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                />
                <input 
                    type="text" 
                    placeholder="Artist"
                    value={formData.songArtist}
                    onChange={e => setFormData({...formData, songArtist: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                />
                <input 
                    type="text" 
                    placeholder="Song URL (Spotify, Apple Music...)"
                    value={formData.songUrl}
                    onChange={e => setFormData({...formData, songUrl: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                />
             </div>
        </div>

        <div className="px-6 py-6 space-y-5">
             <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Social Links</h3>
             <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Instagram size={18} /></div>
                <input 
                    type="text" 
                    placeholder="Instagram Username"
                    value={formData.instagram}
                    onChange={e => setFormData({...formData, instagram: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                />
             </div>
             <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Twitter size={18} /></div>
                <input 
                    type="text" 
                    placeholder="Twitter/X Username"
                    value={formData.twitter}
                    onChange={e => setFormData({...formData, twitter: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                />
             </div>
        </div>
      </div>
    </div>
  );
};

// --- PRIVACY & SECURITY ---
export const PrivacySecurity: React.FC<SubPageProps> = ({ onBack, onNavigate }) => {
  const [showActivity, setShowActivity] = useState(true);

  useEffect(() => {
    const user = getUser(CURRENT_USER.id);
    if (user) {
        setShowActivity(user.showActivityStatus ?? true);
    }
  }, []);

  const handleToggleActivity = (val: boolean) => {
    setShowActivity(val);
    const user = getUser(CURRENT_USER.id);
    if (user) {
        updateUser({ ...user, showActivityStatus: val });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
        <span className="font-bold text-lg">Privacy & Security</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-2">Account Privacy</h3>
            <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl px-4 shadow-sm">
                <ToggleItem label="Private Account" description="Only approved followers can see your fits" icon={Lock} />
                <ToggleItem 
                    label="Show Activity Status" 
                    description="Allow accounts you follow to see when you're active" 
                    icon={Eye} 
                    checked={showActivity}
                    onChange={handleToggleActivity}
                />
            </div>
        </div>

        <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-2">Data & Security</h3>
            <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl px-4 shadow-sm">
                 <button 
                    onClick={() => onNavigate && onNavigate('twoFactor')}
                    className="w-full flex items-center justify-between py-4 border-b border-gray-50 dark:border-zinc-800 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-t-2xl px-2"
                 >
                    <div className="flex items-center gap-3">
                        <Shield size={20} className="text-gray-400 dark:text-zinc-500"/>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">Two-Factor Authentication</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600" />
                 </button>
                 <button 
                    onClick={() => onNavigate && onNavigate('loginActivity')}
                    className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-b-2xl px-2"
                 >
                    <div className="flex items-center gap-3">
                        <Monitor size={20} className="text-gray-400 dark:text-zinc-500"/>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">Login Activity</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600" />
                 </button>
            </div>
        </div>
      </div>
    </div>
  );
};

// --- TWO FACTOR AUTH ---
export const TwoFactorAuth: React.FC<SubPageProps> = ({ onBack }) => {
    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
                <span className="font-bold text-lg">Two-Factor Auth</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                        <Shield size={32} />
                    </div>
                    <h2 className="text-xl font-black text-center mb-2">Add extra security</h2>
                    <p className="text-center text-gray-500 dark:text-zinc-400 text-sm">Protect your account by requiring an additional code when you log in.</p>
                </div>

                <div className="space-y-4">
                    <div className="p-4 border border-gray-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-50 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                                <Smartphone size={20} className="text-black dark:text-white" />
                            </div>
                            <div>
                                <div className="font-bold text-sm">Text Message</div>
                                <div className="text-xs text-gray-500 dark:text-zinc-500">Code sent to number ending in 8832</div>
                            </div>
                        </div>
                        <ToggleItem label="" defaultValue={false} />
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-50 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                                <QrCode size={20} className="text-black dark:text-white" />
                            </div>
                            <div>
                                <div className="font-bold text-sm">Authenticator App</div>
                                <div className="text-xs text-gray-500 dark:text-zinc-500">Recommended</div>
                            </div>
                        </div>
                        <ToggleItem label="" defaultValue={false} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- LOGIN ACTIVITY ---
export const LoginActivity: React.FC<SubPageProps> = ({ onBack }) => {
    const sessions = [
        { id: 1, device: 'iPhone 15 Pro', location: 'Los Angeles, CA', active: true, icon: Smartphone },
        { id: 2, device: 'MacBook Air', location: 'Los Angeles, CA', active: false, time: '2 hours ago', icon: Laptop },
        { id: 3, device: 'iPhone 15 Pro', location: 'New York, NY', active: false, time: '3 days ago', icon: Smartphone },
    ];

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
                <span className="font-bold text-lg">Login Activity</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3 px-2">Where you're logged in</h3>
                <div className="space-y-4">
                    {sessions.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-3">
                            <div className="flex items-start gap-4">
                                <div className="mt-1">
                                    <s.icon size={24} className="text-gray-800 dark:text-zinc-300" />
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-black dark:text-white">{s.device}</div>
                                    <div className="text-xs text-gray-500 dark:text-zinc-500">{s.location} • {s.active ? <span className="text-green-600 font-bold">Active now</span> : s.time}</div>
                                </div>
                            </div>
                            {!s.active && (
                                <button className="text-xs font-bold text-gray-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400">Log Out</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- NOTIFICATIONS ---
export const NotificationSettings: React.FC<SubPageProps> = ({ onBack }) => {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
          <span className="font-bold text-lg">Notifications</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl px-4 shadow-sm mb-6">
              <ToggleItem label="Pause All" icon={Bell} />
          </div>

          <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-2">Interactions</h3>
          <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl px-4 shadow-sm mb-6">
              <ToggleItem label="Likes" defaultValue={true} icon={Heart} />
              <ToggleItem label="Comments" defaultValue={true} icon={MessageSquare} />
              <ToggleItem label="New Followers" defaultValue={true} icon={UserPlus} />
          </div>

          <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-2">Fitted</h3>
          <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl px-4 shadow-sm">
              <ToggleItem label="Stylist Updates" defaultValue={true} />
              <ToggleItem label="Trend Alerts" defaultValue={false} />
              <ToggleItem label="App Updates" defaultValue={true} />
          </div>
        </div>
      </div>
    );
};

// --- APPEARANCE ---
interface AppearanceProps extends SubPageProps {
    currentTheme?: 'light' | 'dark' | 'system';
    setTheme?: (t: 'light' | 'dark' | 'system') => void;
}

export const AppearanceSettings: React.FC<AppearanceProps> = ({ onBack, currentTheme, setTheme }) => {
    
    const ThemeOption = ({ id, label, icon: Icon }: any) => (
        <button 
            onClick={() => setTheme && setTheme(id)}
            className={`flex-1 p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                currentTheme === id 
                ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800 ring-1 ring-black dark:ring-white' 
                : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
            }`}
        >
            <Icon size={24} className={currentTheme === id ? 'text-black dark:text-white' : 'text-gray-400 dark:text-zinc-500'} />
            <span className={`text-sm font-bold ${currentTheme === id ? 'text-black dark:text-white' : 'text-gray-600 dark:text-zinc-400'}`}>{label}</span>
        </button>
    );

    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
          <span className="font-bold text-lg">Appearance</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-4">App Theme</h3>
            <div className="flex gap-4 mb-8">
                <ThemeOption id="light" label="Light" icon={Sun} />
                <ThemeOption id="dark" label="Dark" icon={Moon} />
                <ThemeOption id="system" label="System" icon={Monitor} />
            </div>
            
            <p className="text-xs text-gray-400 dark:text-zinc-500 text-center leading-relaxed">
                Choose your preferred theme. System will match your device settings.
            </p>
        </div>
      </div>
    );
};

// --- FAQS ---
export const FAQs: React.FC<SubPageProps> = ({ onBack }) => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const questions = [
        { q: "How does the AI generation work?", a: "Fitted uses the Nano Banana Pro model by Google to generate hyper-realistic images based on your uploaded items and face reference." },
        { q: "Is Fitted free to use?", a: "Yes! Basic outfit generation and sharing is free. Advanced stylist features require a monthly subscription." },
        { q: "How do I become a verified stylist?", a: "Go to Messages, click the badge icon, and subscribe to the Stylist Pro tier to get verified and start earning." },
        { q: "Can I delete my account?", a: "Yes, you can request account deletion via the Contact Us form." }
    ];

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
                <span className="font-bold text-lg">FAQs</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {questions.map((item, i) => (
                    <div key={i} className="border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden">
                        <button 
                            onClick={() => setOpenIndex(openIndex === i ? null : i)}
                            className="w-full flex items-center justify-between p-4 text-left font-bold text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 text-black dark:text-white"
                        >
                            <span>{item.q}</span>
                            {openIndex === i ? <Minus size={16} /> : <Plus size={16} />}
                        </button>
                        {openIndex === i && (
                            <div className="p-4 pt-0 text-sm text-gray-500 dark:text-zinc-400 leading-relaxed bg-gray-50/50 dark:bg-zinc-800/50">
                                {item.a}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- PRIVACY POLICY TEXT ---
export const PrivacyPolicyText: React.FC<SubPageProps> = ({ onBack }) => (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
            <span className="font-bold text-lg">Privacy Policy</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-600 dark:text-zinc-400 leading-relaxed space-y-4">
            <p><strong>Last Updated: October 2023</strong></p>
            <p>At Fitted, we prioritize your privacy. This policy outlines how we collect, use, and protect your data.</p>
            <h3 className="font-bold text-black dark:text-white mt-4">1. Information We Collect</h3>
            <p>We collect information you provide directly, such as your username, email, and uploaded content (photos, outfits). We also collect usage data to improve our services.</p>
            <h3 className="font-bold text-black dark:text-white mt-4">2. AI Data Usage</h3>
            <p>Photos uploaded for AI generation (Face Reference) are processed ephemerally and stored securely associated with your account. We do not use your personal photos to train public models without consent.</p>
            <h3 className="font-bold text-black dark:text-white mt-4">3. Data Security</h3>
            <p>We implement industry-standard security measures to protect your data. However, no method of transmission is 100% secure.</p>
        </div>
    </div>
);

// --- HELP & SUPPORT (Main Hub) ---
export const HelpSupport: React.FC<SubPageProps> = ({ onBack, onNavigate }) => {
    const [helpExpanded, setHelpExpanded] = useState(false);
    const [email, setEmail] = useState('');
    const [concern, setConcern] = useState('');
    const [sent, setSent] = useState(false);

    const handleSendHelp = () => {
        setSent(true);
        setTimeout(() => {
            setHelpExpanded(false);
            setSent(false);
            setEmail('');
            setConcern('');
        }, 2000);
    };

    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
          <span className="font-bold text-lg">Help & Support</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4 mb-8">
                <button 
                    onClick={() => onNavigate && onNavigate('faqs')}
                    className="w-full bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl flex items-center justify-between hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <FileText className="text-gray-500 dark:text-zinc-400" size={20} />
                        <span className="font-bold text-sm">FAQs</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600" />
                </button>
                <button 
                    onClick={() => onNavigate && onNavigate('contact')}
                    className="w-full bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl flex items-center justify-between hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Mail className="text-gray-500 dark:text-zinc-400" size={20} />
                        <span className="font-bold text-sm">Contact Us</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600" />
                </button>
                <button 
                    onClick={() => onNavigate && onNavigate('privacyPolicy')}
                    className="w-full bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl flex items-center justify-between hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Shield className="text-gray-500 dark:text-zinc-400" size={20} />
                        <span className="font-bold text-sm">Privacy Policy</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600" />
                </button>
            </div>

            {/* Live Chat / Get Help Section */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
                    <HelpCircle size={18} />
                    Need direct help?
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-300 mb-4 leading-relaxed">
                    Our support team is available Mon-Fri, 9am - 5pm EST. 
                </p>
                
                {/* Locked Live Chat Button */}
                <button disabled className="w-full bg-blue-200 dark:bg-blue-900/50 text-blue-400 dark:text-blue-500 font-bold text-xs py-3 rounded-xl shadow-none cursor-not-allowed flex items-center justify-center gap-2 mb-3">
                    <Lock size={12} />
                    Start Live Chat (Locked)
                </button>

                {/* Get Help Expandable Section */}
                {!helpExpanded ? (
                    <button 
                        onClick={() => setHelpExpanded(true)}
                        className="w-full bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 font-bold text-xs py-3 rounded-xl shadow-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 transition-all"
                    >
                        Get Help
                    </button>
                ) : (
                    <div className="animate-in slide-in-from-top-2 fade-in bg-white dark:bg-zinc-900 p-3 rounded-xl border border-blue-100 dark:border-blue-900/50">
                        {sent ? (
                            <div className="flex flex-col items-center justify-center py-6 text-green-600">
                                <CheckCircle size={32} className="mb-2" />
                                <span className="font-bold text-sm">Sent! We'll be in touch.</span>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <input 
                                    type="email" 
                                    placeholder="Your Email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 dark:text-white"
                                />
                                <textarea 
                                    rows={3}
                                    placeholder="Describe your concern..."
                                    value={concern}
                                    onChange={(e) => setConcern(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 resize-none dark:text-white"
                                />
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setHelpExpanded(false)}
                                        className="flex-1 bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 py-2 rounded-lg text-xs font-bold"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleSendHelp}
                                        disabled={!email || !concern}
                                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                                    >
                                        Send Request
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    );
};

// --- CONTACT US (Reusable Get Help Form Page) ---
export const ContactUs: React.FC<SubPageProps> = ({ onBack }) => {
    const [email, setEmail] = useState('');
    const [concern, setConcern] = useState('');
    const [sent, setSent] = useState(false);

    const handleSend = () => {
        setSent(true);
        setTimeout(() => {
            onBack();
        }, 2000);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-black dark:text-white">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full"><ArrowLeft size={24} /></button>
                <span className="font-bold text-lg">Contact Us</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                {sent ? (
                    <div className="flex flex-col items-center justify-center h-full text-green-600">
                        <CheckCircle size={48} className="mb-4" />
                        <h3 className="font-bold text-xl mb-2">Message Sent</h3>
                        <p className="text-gray-500 dark:text-zinc-500 text-center text-sm">Our team will get back to you via email shortly.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-2">Have a question or feedback? Fill out the form below.</p>
                        <div>
                            <label className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5 block">Email Address</label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5 block">Message</label>
                            <textarea 
                                rows={6}
                                value={concern}
                                onChange={(e) => setConcern(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white resize-none dark:text-white"
                            />
                        </div>
                        <Button onClick={handleSend} disabled={!email || !concern}>Send Message</Button>
                    </div>
                )}
            </div>
        </div>
    );
};