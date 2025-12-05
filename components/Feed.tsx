
import React, { useState, useEffect } from 'react';
import { PostItem } from './PostItem';
import { FullPostView } from './FullPostView';
import { Post } from '../types';
import { getAllPosts, subscribe } from '../services/mockDb';

interface FeedProps {
  onViewProfile?: (userId: string) => void;
  onViewBrand?: (brandName: string) => void;
  onViewHashtag?: (hashtag: string) => void;
  selectedPost: Post | null;
  onOpenFullView: (post: Post | null) => void;
}

export const Feed: React.FC<FeedProps> = ({ onViewProfile, onViewBrand, onViewHashtag, selectedPost, onOpenFullView }) => {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    // Initial load
    setPosts(getAllPosts());

    // Subscribe to DB updates (e.g. new posts)
    const unsubscribe = subscribe(() => {
        const currentPosts = getAllPosts();
        setPosts(currentPosts);
        
        // If the selected post was deleted, close full view
        if (selectedPost) {
            const exists = currentPosts.find(p => p.id === selectedPost.id);
            if (!exists) {
                onOpenFullView(null);
            }
        }
    });
    return () => unsubscribe();
  }, [selectedPost, onOpenFullView]);
  
  if (selectedPost) {
    return (
        <FullPostView 
            post={selectedPost} 
            onBack={() => onOpenFullView(null)} 
            onViewProfile={onViewProfile}
            onViewBrand={onViewBrand}
            onViewHashtag={onViewHashtag}
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
            onViewHashtag={onViewHashtag}
        />
      ))}
      <div className="h-24"></div> {/* Spacer for bottom nav */}
    </div>
  );
};
