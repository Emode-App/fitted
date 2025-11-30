import React, { useMemo, useState, useEffect } from 'react';
import { Search, Trophy, Flame } from 'lucide-react';
import { TOP_STYLISTS } from '../constants';
import { getAllPosts, subscribe } from '../services/mockDb';
import { Post } from '../types';

interface ExploreProps {
  onViewProfile?: (userId: string) => void;
  onViewTrend?: (trendName: string, image: string) => void;
  onOpenPost?: (post: Post) => void;
}

export const Explore: React.FC<ExploreProps> = ({ onViewProfile, onViewTrend, onOpenPost }) => {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    setPosts(getAllPosts());
    const unsubscribe = subscribe(() => {
        setPosts(getAllPosts());
    });
    return () => unsubscribe();
  }, []);

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
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
          type="text" 
          placeholder="Search brands, styles, people..." 
          className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-black dark:text-white rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 shadow-sm"
        />
      </div>

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
                    className="aspect-square bg-gray-200 dark:bg-zinc-800 relative cursor-pointer"
                    onClick={() => onOpenPost && onOpenPost(post)}
                  >
                     <img src={post.generatedImage} className="w-full h-full object-cover" alt="Explore" />
                  </div>
                ))}
             </div>
         )}
      </div>
    </div>
  );
};