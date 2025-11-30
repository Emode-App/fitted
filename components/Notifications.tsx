
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Heart, UserPlus, ShoppingBag, Check } from 'lucide-react';
import { toggleFollow, isFollowing, subscribe } from '../services/mockDb';
import { CURRENT_USER } from '../constants';
import { TimeAgo } from './Shared';

interface NotificationsProps {
  onBack: () => void;
  onViewProfile: (userId: string) => void;
}

export const Notifications: React.FC<NotificationsProps> = ({ onBack, onViewProfile }) => {
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  
  // Initialize notifications with dynamic timestamps relative to "now"
  const [notifications] = useState(() => {
    const now = Date.now();
    return [
      { id: 1, type: 'like', user: 'fashion_killa', userId: 'u2', text: 'liked your fit.', timestamp: '2m', createdAt: now - 2 * 60 * 1000, image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=100' },
      { id: 2, type: 'follow', user: 'steven', userId: 's1', text: 'started following you.', timestamp: '1h', createdAt: now - 60 * 60 * 1000, image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100' },
      { id: 3, type: 'like', user: 'bloodyosiris', userId: 's2', text: 'liked your fit.', timestamp: '3h', createdAt: now - 3 * 60 * 60 * 1000, image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=100' },
      { id: 4, type: 'system', text: 'Your Helmut Lang hoodie is trending!', timestamp: '5h', createdAt: now - 5 * 60 * 60 * 1000, icon: <ShoppingBag size={18} /> },
      { id: 5, type: 'follow', user: 'alealimay', userId: 's3', text: 'started following you.', timestamp: '1d', createdAt: now - 24 * 60 * 60 * 1000, image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=100' },
    ];
  });

  useEffect(() => {
    const updateFollowStatus = () => {
        const map: Record<string, boolean> = {};
        notifications.forEach(n => {
            if (n.userId) {
                map[n.userId] = isFollowing(CURRENT_USER.id, n.userId);
            }
        });
        setFollowingMap(map);
    };

    updateFollowStatus();
    const unsubscribe = subscribe(updateFollowStatus);
    return () => unsubscribe();
  }, [notifications]);

  const handleFollowToggle = (e: React.MouseEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFollow(CURRENT_USER.id, targetId);
  };

  const handleUserClick = (userId?: string) => {
    if (userId) {
        onViewProfile(userId);
    }
  };

  return (
    <div className="bg-white dark:bg-black min-h-screen pb-20 animate-in slide-in-from-right duration-300 transition-colors duration-200">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-20 px-4 h-14 flex items-center border-b border-gray-100 dark:border-zinc-800 text-black dark:text-white">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft size={24} />
        </button>
        <div className="font-bold text-lg ml-2">Notifications</div>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-zinc-900">
        {notifications.map((notif) => (
            <div 
                key={notif.id} 
                className="p-4 flex gap-3 items-center hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                onClick={() => handleUserClick(notif.userId)}
            >
                <div className="relative shrink-0">
                    {notif.type === 'system' ? (
                        <div className="w-12 h-12 bg-black dark:bg-zinc-800 rounded-full flex items-center justify-center text-white">
                            {notif.icon}
                        </div>
                    ) : (
                        <img src={notif.image} className="w-12 h-12 rounded-full object-cover border border-gray-100 dark:border-zinc-800" alt="avatar" />
                    )}
                    
                    {/* Icon Badge */}
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-black ${
                        notif.type === 'like' ? 'bg-red-500 text-white' : 
                        notif.type === 'follow' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-white'
                    }`}>
                        {notif.type === 'like' && <Heart size={10} fill="currentColor" />}
                        {notif.type === 'follow' && <UserPlus size={10} />}
                    </div>
                </div>

                <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-zinc-200 leading-snug">
                        {notif.user && <span className="font-bold mr-1 hover:underline text-black dark:text-white">{notif.user}</span>}
                        {notif.text}
                    </p>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 font-medium mt-0.5 block">
                        <TimeAgo timestamp={notif.createdAt} staticText={notif.timestamp} />
                    </span>
                </div>

                {notif.type === 'like' && (
                    <div className="w-10 h-10 rounded-md bg-gray-100 dark:bg-zinc-800 overflow-hidden shrink-0 border border-gray-100 dark:border-zinc-800">
                        <img src={notif.image} className="w-full h-full object-cover" alt="post" />
                    </div>
                )}
                
                {notif.type === 'follow' && notif.userId && (
                    <button 
                        onClick={(e) => handleFollowToggle(e, notif.userId!)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all z-10 ${
                            followingMap[notif.userId]
                            ? 'bg-black dark:bg-white text-white dark:text-black' 
                            : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-black dark:text-white'
                        }`}
                    >
                        {followingMap[notif.userId] ? 'Following' : 'Follow Back'}
                    </button>
                )}
            </div>
        ))}
      </div>
    </div>
  );
};
