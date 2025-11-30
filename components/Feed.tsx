
import React, { useState, useEffect } from 'react';
import { PostItem } from './PostItem';
import { FullPostView } from './FullPostView';
import { Post } from '../types';
import { getAllPosts, subscribe } from '../services/mockDb';

interface FeedProps {
  onViewProfile?: (userId: string) => void;
  onViewBrand?: (brandName: string) => void;
  selectedPost: Post | null;
  onOpenFullView: (post: Post | null) => void;
}

export const Feed: React.FC<FeedProps> = ({ onViewProfile, onViewBrand, selectedPost, onOpenFullView }) => {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    // Initial load
    setPosts(getAllPosts());

    // Subscribe to DB updates (e.g. new posts)
    const unsubscribe = subscribe(() => {
        setPosts(getAllPosts());
    });
    return () => unsubscribe();
  }, []);
  
  if (selectedPost) {
    return (
        <FullPostView 
            post={selectedPost} 
            onBack={() => onOpenFullView(null)} 
            onViewProfile={onViewProfile}
            onViewBrand={onViewBrand}
        />
    );
  }

  return (
    <div className="pt-0 w-full">
      {posts.map(post => (
        <PostItem 
            key={post.id} 
            post={post} 
            onOpenFullView={onOpenFullView}
            onViewProfile={onViewProfile}
        />
      ))}
      <div className="h-24"></div> {/* Spacer for bottom nav */}
    </div>
  );
};
