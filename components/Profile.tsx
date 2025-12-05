
import React, { useEffect, useState } from 'react';
import { CURRENT_USER } from '../constants';
import { Settings, MapPin, Camera, Instagram, Twitter, ArrowLeft, CheckCircle, Music, ExternalLink, BadgeCheck, MessageCircle, Grid, Bookmark, LayoutGrid, Link as LinkIcon, Briefcase } from 'lucide-react';
import { getUser, getUserPosts, subscribe, isFollowing, toggleFollow, getFollowers, getFollowing, updateUser, getSavedPosts } from '../services/mockDb';
import { User, Post } from '../types';
import { Modal, TikTokLogo } from './Shared';

interface ProfileProps {
  userId?: string;
  onBack?: () => void;
  onEditProfile?: () => void;
  onOpenPost?: (post: Post) => void;
  onViewProfile?: (userId: string) => void;
  onMessage?: (userId: string) => void;
}

export const Profile: React.FC<ProfileProps> = ({ userId, onBack, onEditProfile, onOpenPost, onViewProfile, onMessage }) => {
  const [user, setUser] = useState<User>(CURRENT_USER);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'fits' | 'saved'>('fits');
  const [isFollowed, setIsFollowed] = useState(false);
  
  // Follow List State
  const [followListType, setFollowListType] = useState<'followers' | 'following' | null>(null);
  const [followList, setFollowList] = useState<User[]>([]);

  // Song Modal State
  const [songModalOpen, setSongModalOpen] = useState(false);

  useEffect(() => {
    const targetUserId = userId || CURRENT_USER.id;
    
    const loadData = () => {
        const foundUser = getUser(targetUserId);
        if (foundUser) {
            setUser(foundUser);
            setPosts(getUserPosts(targetUserId));
            setIsFollowed(isFollowing(CURRENT_USER.id, targetUserId));
            
            // If viewing own profile, load saved posts
            if (targetUserId === CURRENT_USER.id) {
                setSavedPosts(getSavedPosts(CURRENT_USER.id));
            }
            
            // Refresh list if open
            if (followListType === 'followers') {
                setFollowList(getFollowers(targetUserId));
            } else if (followListType === 'following') {
                setFollowList(getFollowing(targetUserId));
            }
        }
    };

    loadData();

    // Subscribe to DB changes to update profile in real-time
    const unsubscribe = subscribe(() => {
        loadData();
    });

    return () => unsubscribe();
  }, [userId, followListType]);

  const handleFollowToggle = () => {
    toggleFollow(CURRENT_USER.id, user.id);
  };
  
  const handleListFollowToggle = (targetId: string) => {
    toggleFollow(CURRENT_USER.id, targetId);
  };

  const handleOpenList = (type: 'followers' | 'following') => {
    if (type === 'followers') {
        setFollowList(getFollowers(user.id));
    } else {
        setFollowList(getFollowing(user.id));
    }
    setFollowListType(type);
  };

  const handleAiFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const url = URL.createObjectURL(e.target.files[0]);
        updateUser({
            ...user,
            aiFaceUrl: url
        });
    }
  };

  const openSongLink = () => {
      if (user.favoriteSong?.url) {
          window.open(user.favoriteSong.url, '_blank');
      }
      setSongModalOpen(false);
  };

  const isCurrentUser = user.id === CURRENT_USER.id;
  const isOnline = user.showActivityStatus !== false; // Default true if undefined
  
  // Determine which posts to display based on active tab
  const displayPosts = activeTab === 'saved' ? savedPosts : posts;

  return (
    <div className="pb-24 bg-white dark:bg-black min-h-full transition-colors duration-200">
      {/* Header Banner */}
      <div className="h-32 w-full bg-gray-200 dark:bg-zinc-800 relative overflow-hidden">
        {user.headerUrl && (
            <img src={user.headerUrl} className="w-full h-full object-cover" alt="header" />
        )}
        <div className="absolute inset-0 bg-black/10"></div>
        
        {/* Back Button if viewing another profile */}
        {!isCurrentUser && onBack && (
            <button 
                onClick={onBack} 
                className="absolute top-4 left-4 bg-white/50 backdrop-blur-md p-2 rounded-full text-black hover:bg-white transition-colors"
            >
                <ArrowLeft size={20} />
            </button>
        )}
      </div>

      {/* Profile Content */}
      <div className="px-6 pb-2 border-b border-gray-100 dark:border-zinc-800 relative">
        <div className="flex justify-between items-end mb-4 -mt-12">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden border-[4px] border-white dark:border-black shadow-sm">
                <img src={user.avatarUrl} alt="profile" className="w-full h-full object-cover" />
            </div>
            {/* Active Status Dot - Conditional Render */}
            {isOnline && (
                <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-[3px] border-white dark:border-black" />
            )}
          </div>
          
          {isCurrentUser ? (
            <button 
                onClick={onEditProfile}
                className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-700 px-6 py-2 rounded-full font-bold text-sm shadow-sm active:scale-95 transition-transform hover:bg-gray-50 dark:hover:bg-zinc-900 text-black dark:text-white mb-0"
            >
                Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
                <button 
                    onClick={() => onMessage && onMessage(user.id)}
                    className="bg-gray-100 dark:bg-zinc-800 text-black dark:text-white w-10 h-10 flex items-center justify-center rounded-full shadow-sm active:scale-95 transition-transform hover:bg-gray-200 dark:hover:bg-zinc-700"
                >
                    <MessageCircle size={20} />
                </button>
                <button 
                    onClick={handleFollowToggle}
                    className={`${isFollowed ? 'bg-gray-200 dark:bg-zinc-800 text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'} px-6 py-2 rounded-full font-bold text-sm shadow-lg shadow-black/20 dark:shadow-white/10 active:scale-95 transition-transform mb-0`}
                >
                    {isFollowed ? 'Following' : 'Follow'}
                </button>
            </div>
          )}
        </div>

        {/* Info Row: Name Left, Favorites Right */}
        <div className="flex justify-between items-start mb-2">
            <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 mb-1">
                    <h1 className="text-3xl font-black text-black dark:text-white tracking-tight truncate">{user.username}</h1>
                    {user.isVerifiedStylist && <BadgeCheck size={20} className="text-blue-500 fill-blue-50 dark:fill-blue-900 shrink-0" />}
                </div>
                <div className="text-gray-500 dark:text-zinc-400 text-sm mb-2">{user.handle}</div>
                
                {user.rate && (
                    <div className="inline-block bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold text-xs px-2 py-1 rounded-md mb-2 border border-green-100 dark:border-green-800 mr-2">
                        {user.rate}
                    </div>
                )}
                
                {user.isBusinessAccount && (
                    <div className="inline-flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold text-xs px-2 py-1 rounded-md mb-2">
                         <Briefcase size={10} />
                         <span>Business Account</span>
                    </div>
                )}
                
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-400 font-medium mt-1">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate max-w-[150px]">{user.location}</span>
                    {isOnline && (
                        <>
                            <span className="mx-2 shrink-0">•</span>
                            <span className="text-green-600 font-bold shrink-0">Active now</span>
                        </>
                    )}
                </div>
            </div>

            {/* Favorites Pills Stacked Right */}
            <div className="flex flex-col items-end gap-2 shrink-0 mt-1 pl-2">
                {user.favoriteBrand && (
                    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 px-3 py-1.5 rounded-full">
                        <span className="text-xs shrink-0 leading-none">🫶</span>
                        <span className="text-xs font-bold text-black dark:text-white max-w-[120px] truncate">{user.favoriteBrand}</span>
                    </div>
                )}
                
                {user.favoriteSong && (
                    <button 
                        onClick={() => setSongModalOpen(true)}
                        className="flex items-center gap-1.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 px-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-300 transition-colors"
                    >
                        <Music size={12} className="text-gray-400 dark:text-zinc-500 shrink-0" />
                        <span className="text-xs font-bold text-black dark:text-white max-w-[120px] truncate">{user.favoriteSong.title}</span>
                    </button>
                )}
            </div>
        </div>

        <p className="text-sm font-medium leading-relaxed mb-2 text-gray-800 dark:text-zinc-300">{user.bio}</p>
        
        {/* Profile Link */}
        {user.website && (
            <a 
                href={user.website} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline mb-1"
            >
                <LinkIcon size={14} />
                <span className="truncate max-w-[280px]">{user.website.replace(/^https?:\/\//, '')}</span>
            </a>
        )}

        <div className="flex items-center gap-8 mt-1">
            <div className="flex gap-8">
                <button onClick={() => handleOpenList('followers')} className="text-left group cursor-pointer hover:opacity-70 transition-opacity">
                    <span className="font-black text-lg block text-black dark:text-white group-hover:text-blue-600 transition-colors">{user.stats.followers}</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-500 font-medium">followers</span>
                </button>
                <button onClick={() => handleOpenList('following')} className="text-left group cursor-pointer hover:opacity-70 transition-opacity">
                    <span className="font-black text-lg block text-black dark:text-white group-hover:text-blue-600 transition-colors">{user.stats.following}</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-500 font-medium">following</span>
                </button>
                <div>
                    <span className="font-black text-lg block text-black dark:text-white">{posts.length > 0 ? posts.length : user.stats.fits}</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-500 font-medium">fits</span>
                </div>
            </div>

            {/* Social Icons to the right of stats */}
            <div className="h-8 w-px bg-gray-200 dark:bg-zinc-800 mx-2"></div>
            <div className="flex gap-3 items-center">
                {user.socials?.instagram && (
                    <a href={`https://instagram.com/${user.socials.instagram}`} target="_blank" rel="noreferrer" className="text-gray-400 dark:text-zinc-600 hover:text-pink-600 transition-colors">
                        <Instagram size={20} />
                    </a>
                )}
                {user.socials?.tiktok && (
                    <a href={`https://tiktok.com/@${user.socials.tiktok}`} target="_blank" rel="noreferrer" className="text-gray-400 dark:text-zinc-600 hover:text-black dark:hover:text-white transition-colors translate-y-px">
                         <TikTokLogo className="w-5 h-5" />
                    </a>
                )}
                {user.socials?.twitter && (
                    <a href={`https://twitter.com/${user.socials.twitter}`} target="_blank" rel="noreferrer" className="text-gray-400 dark:text-zinc-600 hover:text-blue-400 transition-colors">
                        <Twitter size={20} />
                    </a>
                )}
            </div>
        </div>
      </div>

      {/* Face Data Upload (Only for Current User) */}
      {isCurrentUser && (
        <div className="px-4 pt-4 pb-0">
            <div className={`border-2 border-dashed ${user.aiFaceUrl ? 'border-green-300 bg-green-50/50 dark:bg-green-900/20 dark:border-green-800' : 'border-purple-300 bg-purple-50/50 dark:bg-purple-900/20 dark:border-purple-800'} rounded-2xl p-4 flex items-center gap-4 mb-1`}>
                <div className={`w-12 h-12 rounded-full ${user.aiFaceUrl ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400'} flex items-center justify-center shrink-0 overflow-hidden`}>
                    {user.aiFaceUrl ? (
                        <img src={user.aiFaceUrl} className="w-full h-full object-cover" alt="ai face" />
                    ) : (
                        <Camera size={20} />
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                         <h3 className={`font-bold text-sm ${user.aiFaceUrl ? 'text-green-900 dark:text-green-400' : 'text-purple-900 dark:text-purple-400'}`}>Get Fitted AI Access</h3>
                         {user.aiFaceUrl && <CheckCircle size={14} className="text-green-600" />}
                    </div>
                    <p className={`text-xs ${user.aiFaceUrl ? 'text-green-700 dark:text-green-300' : 'text-purple-700 dark:text-purple-300'}`}>
                        {user.aiFaceUrl ? 'Face data saved. Ready for Nano Banana.' : 'Upload a face photo for Nano Banana generation.'}
                    </p>
                </div>
                <label className={`text-xs font-bold ${user.aiFaceUrl ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'} text-white px-3 py-1.5 rounded-lg shrink-0 cursor-pointer shadow-sm active:scale-95 transition-all`}>
                    {user.aiFaceUrl ? 'Change' : 'Upload'}
                    <input type="file" className="hidden" onChange={handleAiFaceUpload} accept="image/*" />
                </label>
            </div>
        </div>
      )}

      {/* Tabs for Current User */}
      {isCurrentUser && (
          <div className="flex border-b border-gray-100 dark:border-zinc-800 px-2 sticky top-14 bg-white dark:bg-black z-10 pt-0">
            <button 
                onClick={() => setActiveTab('fits')} 
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'fits' 
                    ? 'border-black dark:border-white text-black dark:text-white' 
                    : 'border-transparent text-gray-400 dark:text-zinc-600'
                }`}
            >
                <LayoutGrid size={16} />
                <span>My Fits</span>
            </button>
            <button 
                onClick={() => setActiveTab('saved')} 
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'saved' 
                    ? 'border-black dark:border-white text-black dark:text-white' 
                    : 'border-transparent text-gray-400 dark:text-zinc-600'
                }`}
            >
                <Bookmark size={16} />
                <span>Saved</span>
            </button>
          </div>
      )}

      {/* Fits Grid */}
      <div className="px-1 py-1">
        {displayPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-zinc-600">
                <p className="text-sm font-medium">
                    {activeTab === 'saved' ? 'No saved posts yet.' : 'No fits posted yet.'}
                </p>
            </div>
        ) : (
            <div className="grid grid-cols-3 gap-0.5">
                {displayPosts.map((post) => (
                    <div 
                        key={post.id} 
                        className="aspect-square bg-gray-100 dark:bg-zinc-900 relative group overflow-hidden cursor-pointer"
                        onClick={() => onOpenPost && onOpenPost(post)}
                    >
                        <img src={post.generatedImage} className="w-full h-full object-cover" alt="fit" />
                        {post.isLiked && (
                            <div className="absolute top-1 right-1">
                                <span className="text-xs">🔥</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* User List Modal (Followers/Following) */}
      <Modal isOpen={!!followListType} onClose={() => setFollowListType(null)} title={followListType === 'followers' ? 'Followers' : 'Following'} variant="center">
         <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {followList.length === 0 && (
                <div className="text-center py-8 text-gray-400 dark:text-zinc-600 text-sm">No users found.</div>
            )}
            {followList.map(u => {
                const amIFollowing = isFollowing(CURRENT_USER.id, u.id);
                const isMe = u.id === CURRENT_USER.id;
                
                return (
                    <div key={u.id} className="flex items-center justify-between">
                        <div 
                            className="flex items-center gap-3 cursor-pointer hover:opacity-80" 
                            onClick={() => { 
                                setFollowListType(null); 
                                if (onViewProfile) onViewProfile(u.id);
                            }}
                        >
                            <img src={u.avatarUrl} className="w-10 h-10 rounded-full object-cover bg-gray-200 dark:bg-zinc-800" alt={u.username} />
                            <div>
                                <div className="text-sm font-bold text-black dark:text-white flex items-center gap-1">
                                    {u.username}
                                    {u.isVerifiedStylist && <BadgeCheck size={14} className="text-blue-500 fill-blue-50 dark:fill-blue-900" />}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-zinc-500">{u.handle}</div>
                            </div>
                        </div>
                        {!isMe && (
                            <button 
                                onClick={() => handleListFollowToggle(u.id)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    amIFollowing 
                                    ? 'bg-gray-100 dark:bg-zinc-800 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700' 
                                    : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800'
                                }`}
                            >
                                {amIFollowing ? 'Following' : 'Follow'}
                            </button>
                        )}
                    </div>
                );
            })}
         </div>
      </Modal>

      {/* Song Modal */}
      <Modal isOpen={songModalOpen} onClose={() => setSongModalOpen(false)} variant="center">
         {user.favoriteSong && (
             <div className="flex flex-col items-center text-center p-2 text-black dark:text-white">
                 <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-500 mb-4">
                    <Music size={32} />
                 </div>
                 <h3 className="text-lg font-bold mb-1">{user.favoriteSong.title}</h3>
                 <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">{user.favoriteSong.artist}</p>
                 
                 <div className="w-full space-y-3">
                     <button 
                        onClick={openSongLink}
                        className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-900"
                     >
                        <span>Open Song</span>
                        <ExternalLink size={14} />
                     </button>
                     <button 
                        onClick={() => setSongModalOpen(false)}
                        className="w-full bg-gray-100 dark:bg-zinc-800 text-black dark:text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-200"
                     >
                        Close
                     </button>
                 </div>
             </div>
         )}
      </Modal>
    </div>
  );
};
