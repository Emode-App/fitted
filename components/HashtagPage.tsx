import React from 'react';
import { ArrowLeft, Filter, Hash } from 'lucide-react';
import { Post } from '../types';
import { getAllPosts } from '../services/mockDb';

interface HashtagPageProps {
  hashtag: string;
  onBack: () => void;
  onOpenPost: (post: Post) => void;
}

export const HashtagPage: React.FC<HashtagPageProps> = ({ hashtag, onBack, onOpenPost }) => {
  // Filter posts that contain the hashtag in the caption (case-insensitive)
  const posts = getAllPosts().filter(p => 
    p.caption.toLowerCase().includes(hashtag.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-black min-h-screen pb-20 animate-in slide-in-from-right duration-300 transition-colors duration-200">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-20 px-4 h-14 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-black dark:text-white">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <ArrowLeft size={24} />
            </button>
            <span className="font-bold text-lg">{hashtag}</span>
        </div>
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <Filter size={20} className="text-gray-500 dark:text-zinc-500" />
        </button>
      </div>

      {/* Hero */}
      <div className="relative h-40 w-full bg-gradient-to-r from-blue-600 to-purple-600 flex flex-col items-center justify-center text-white mb-2">
        <div className="bg-white/20 p-4 rounded-full mb-2 backdrop-blur-md">
            <Hash size={32} />
        </div>
        <h1 className="text-3xl font-black tracking-tight">{hashtag}</h1>
        <p className="text-sm font-medium opacity-90">{posts.length} posts</p>
      </div>

      {/* Grid */}
      <div className="px-1">
        {posts.length === 0 ? (
             <div className="text-center py-20 text-gray-400 dark:text-zinc-600">
                <p>No posts found with this hashtag.</p>
             </div>
        ) : (
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
        )}
      </div>
    </div>
  );
};