
import React, { useMemo, useState, useEffect } from 'react';
import { Search, Trophy, Flame, BadgeCheck, Hash, X } from 'lucide-react';
import { TOP_STYLISTS } from '../constants';
import { getAllPosts, subscribe, searchUsers } from '../services/mockDb';
import { Post, User } from '../types';

interface ExploreProps {
  onViewProfile?: (userId: string) => void;
  onViewTrend?: (trendName: string, image: string) => void;
  onOpenPost?: (post: Post) => void;
  onViewHashtag?: (hashtag: string) => void;
}

export const Explore: React.FC<ExploreProps> = ({ onViewProfile, onViewTrend, onOpenPost, onViewHashtag }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);

  useEffect(() => {
    setPosts(getAllPosts());
    const unsubscribe = subscribe(() => {
        setPosts(getAllPosts());
    });
    return () => unsubscribe();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim()) {
        setUserResults(searchUsers(q));
    } else {
        setUserResults([]);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setUserResults([]);
  };

  const trendingImages = useMemo(() => [
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=400',
    'https://images.unsplash.com/photo-1550614000-4b9519e0031a?auto=format&fit=crop&q=80&w=400'
  ], []);

  const trends = ['Y2K Revival', 'Opium Core', 'Quiet Luxury', 'Blokecore'];

  return (
    <div className="pb-24 px-4 pt-4 w-full bg-gray-50 dark:bg-zinc-950 min-h-full transition-colors duration-200">
      {/* Search Bar */}
      <div className="relative mb-6 sticky top-0 z-20 bg-gray-50 dark:bg-zinc-950 pt-2 pb-2 -mt-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
          type="text" 
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search brands, styles, people..." 
          className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-black dark:text-white rounded-xl py-3 pl-10 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 shadow-sm"
        />
        {searchQuery && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black dark:hover:text-white">
                <X size={16} />
            </button>
        )}
      </div>

      {searchQuery ? (
         // SEARCH RESULTS VIEW
         <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Hashtag Option */}
            <div 
                className="flex items-center gap-3 p-3 mb-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={() => {
                    const tag = searchQuery.startsWith('#') ? searchQuery : `#${searchQuery}`;
                    onViewHashtag && onViewHashtag(tag);
                }}
            >
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-black dark:text-white">
                    <Hash size={20} />
                </div>
                <div>
                    <div className="font-bold text-sm text-black dark:text-white">{searchQuery.startsWith('#') ? searchQuery : `#${searchQuery}`}</div>
                    <div className="text-xs text-gray-500 dark:text-zinc-500">Go to hashtag</div>
                </div>
            </div>

            {/* User Results */}
            <h3 className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 pl-2">Accounts</h3>
            <div className="space-y-2">
                {userResults.length === 0 && (
                    <div className="text-sm text-gray-500 dark:text-zinc-500 pl-2">No accounts found.</div>
                )}
                {userResults.map(user => (
                    <div 
                        key={user.id} 
                        onClick={() => onViewProfile && onViewProfile(user.id)}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent hover:border-gray-100 dark:hover:border-zinc-800 transition-all"
                    >
                        <img src={user.avatarUrl} className="w-10 h-10 rounded-full object-cover bg-gray-200 dark:bg-zinc-800" alt={user.username} />
                        <div>
                            <div className="flex items-center gap-1 font-bold text-sm text-black dark:text-white">
                                {user.username}
                                {user.isVerifiedStylist && <BadgeCheck size={14} className="text-blue-500 fill-blue-50 dark:fill-blue-900" />}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-zinc-500">{user.handle}</div>
                        </div>
                    </div>
                ))}
            </div>
         </div>
      ) : (
        // DEFAULT EXPLORE VIEW
        <>
            {/* Featured Stylists Leaderboard */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-5">
                <Trophy className="text-yellow-500 fill-yellow-500" size={20} />
                <h2 className="font-bold text-xl text-black dark:text-white tracking-tight">Featured Stylists</h2>
                </div>
                <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
                {TOP_STYLISTS.map(stylist => (
                    <div 
                        key={stylist.id} 
                        className="flex flex-col items-center space-y-2 min-w-[72px] cursor-pointer active:opacity-70"
                        onClick={() => onViewProfile && onViewProfile(stylist.user.id)}
                    >
                    <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-orange-300 to-yellow-200">
                        <div className="w-full h-full rounded-full border-2 border-white dark:border-black overflow-hidden">
                        <img src={stylist.user.avatarUrl} className="w-full h-full object-cover" alt={stylist.user.username} />
                        </div>
                    </div>
                    <span className="text-xs font-medium truncate w-full text-center text-black dark:text-white">{stylist.user.username}</span>
                    </div>
                ))}
                </div>
            </div>

            {/* Trending Styles (4 Boxes) */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-5">
                    <Flame className="text-orange-600 fill-orange-600" size={20} />
                    <h2 className="font-bold text-xl text-black dark:text-white tracking-tight">Trending Now</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                {trends.map((trend, i) => (
                    <div 
                        key={trend} 
                        onClick={() => onViewTrend && onViewTrend(trend, trendingImages[i])}
                        className="relative aspect-[16/9] rounded-2xl overflow-hidden group cursor-pointer shadow-sm active:scale-95 transition-transform"
                    >
                    <img src={trendingImages[i]} className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105" alt={trend} />
                    <div className="absolute inset-0 bg-black/30 flex items-end p-3">
                        <span className="text-white font-bold text-sm">{trend}</span>
                    </div>
                    </div>
                ))}
                </div>
            </div>

            {/* Explore Grid - Full Width Real Posts */}
            <div className="-mx-4">
                <div className="px-4 mb-5">
                    <h2 className="font-bold text-xl text-black dark:text-white tracking-tight">Explore</h2>
                </div>
                {posts.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">No posts yet.</div>
                ) : (
                    <div className="grid grid-cols-3 gap-0.5">
                        {posts.map((post) => (
                        <div 
                            key={post.id} 
                            className="aspect-square bg-gray-200 dark:bg-zinc-800 relative cursor-pointer group overflow-hidden"
                            onClick={() => onOpenPost && onOpenPost(post)}
                        >
                            <img src={post.generatedImage} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="Explore" />
                            {post.likes > 0 && (
                                <div className="absolute top-1 right-1 bg-black/40 backdrop-blur-[2px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                    <span className="text-[10px] font-bold text-white shadow-sm">{post.likes}</span>
                                    <span className="text-[8px]">🔥</span>
                                </div>
                            )}
                        </div>
                        ))}
                    </div>
                )}
            </div>
        </>
      )}
    </div>
  );
};
