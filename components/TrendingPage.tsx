
import React from 'react';
import { ArrowLeft, Filter } from 'lucide-react';
import { Post } from '../types';
import { getAllPosts } from '../services/mockDb';

interface TrendingPageProps {
  trendName: string;
  coverImage: string;
  onBack: () => void;
  onOpenPost: (post: Post) => void;
}

export const TrendingPage: React.FC<TrendingPageProps> = ({ trendName, coverImage, onBack, onOpenPost }) => {
  // in a real app, we'd filter by tag. For demo, we just shuffle/slice all posts to simulate a specific feed.
  const posts = getAllPosts().sort(() => 0.5 - Math.random());

  return (
    <div className="bg-white dark:bg-black min-h-screen pb-20 animate-in slide-in-from-right duration-300 transition-colors duration-200">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-20 px-4 h-14 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-black dark:text-white">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <ArrowLeft size={24} />
            </button>
            <span className="font-bold text-lg">{trendName}</span>
        </div>
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <Filter size={20} className="text-gray-500 dark:text-zinc-500" />
        </button>
      </div>

      {/* Hero */}
      <div className="relative h-48 w-full overflow-hidden">
        <img src={coverImage} className="w-full h-full object-cover" alt={trendName} />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <h1 className="text-4xl font-black text-white tracking-tight uppercase drop-shadow-lg text-center px-4">{trendName}</h1>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-zinc-800 mb-2">
        <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
            Explore the latest looks defining the <strong className="text-black dark:text-white">{trendName}</strong> aesthetic. curated by the Fitted community.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-0.5 pb-20">
        {posts.map((post) => (
            <div 
                key={post.id} 
                className="aspect-square bg-gray-100 dark:bg-zinc-900 relative group overflow-hidden cursor-pointer"
                onClick={() => onOpenPost(post)}
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
    </div>
  );
};
