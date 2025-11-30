import React, { useState, useRef, useEffect } from 'react';
import { Post, ClothingItem, Comment } from '../types';
import { MessageCircle, Send, ShoppingBag, ChevronLeft, ChevronRight, MoreHorizontal, Bookmark, EyeOff, Flag, UserPlus, Heart, Copy, Share, Twitter, Instagram, MessageSquare as MessageIcon, Search, Music } from 'lucide-react';
import { Modal, StoreButtonRow, Button, TimeAgo } from './Shared';
import { CURRENT_USER } from '../constants';
import { getPostComments, addComment, toggleCommentLike, subscribe } from '../services/mockDb';

interface PostItemProps {
  post: Post;
  onOpenFullView: (post: Post) => void;
  onViewProfile?: (userId: string) => void;
}

export const PostItem: React.FC<PostItemProps> = ({ post, onOpenFullView, onViewProfile }) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [showTags, setShowTags] = useState(false);
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likes);
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);
  
  // Modals State
  const [showOptions, setShowOptions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  
  // Comment Logic
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  
  const [isSaved, setIsSaved] = useState(false);
  
  // Music / Info Fading Logic
  const [infoState, setInfoState] = useState<'brands' | 'music'>('brands');
  const [isFading, setIsFading] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  // Load comments dynamically
  useEffect(() => {
    const loadComments = () => {
        setComments(getPostComments(post.id));
    };
    loadComments();
    const unsubscribe = subscribe(loadComments);
    return () => unsubscribe();
  }, [post.id]);

  const brands = Array.from(new Set(post.items.map(i => i.brand).filter(b => b))).join(', ');

  // Handle fading loop if music exists
  useEffect(() => {
    if (!post.music || !brands) return;

    const interval = setInterval(() => {
        setIsFading(true); // Start fade out
        
        setTimeout(() => {
            setInfoState(prev => prev === 'brands' ? 'music' : 'brands');
            setIsFading(false); // Start fade in
        }, 500); // Wait for opacity transition to finish

    }, 4000); // Switch every 4 seconds

    return () => clearInterval(interval);
  }, [post.music, brands]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const width = scrollContainerRef.current.offsetWidth;
        const index = Math.round(scrollLeft / width);
        setActiveSlide(index);
    }
  };

  const scrollToIndex = (index: number) => {
    if (scrollContainerRef.current) {
        const width = scrollContainerRef.current.offsetWidth;
        scrollContainerRef.current.scrollTo({
            left: index * width,
            behavior: 'smooth'
        });
    }
  };

  const handleLike = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsLiked(!isLiked);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLiked) {
      setIsLiked(true);
      setLikesCount(prev => prev + 1);
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
     if ((e.target as HTMLElement).closest('button')) return;
     setShowTags(!showTags);
  };

  const handleUserClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewProfile) {
        onViewProfile(post.user.id);
    }
  };

  const handlePostComment = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
        id: `nc_${Date.now()}`,
        username: CURRENT_USER.username,
        avatarUrl: CURRENT_USER.avatarUrl,
        text: newComment,
        timestamp: 'Just now',
        isLiked: false,
        likes: 0
    };
    addComment(post.id, comment);
    setNewComment('');
  };

  const handleLikeComment = (commentId: string) => {
    toggleCommentLike(post.id, commentId);
  };

  const getPolaroidStyle = (idx: number) => {
    // Adjusted coordinates to keep items more centralized and prevent clipping
    const rotations = [-6, 4, -3, 5, -2];
    const tops = [30, 40, 60, 65, 50]; // Kept comfortably within 0-100%
    const lefts = [30, 70, 35, 75, 50]; // Moved away from 10% edges
    
    return {
        transform: `translate(-50%, -50%) rotate(${rotations[idx % rotations.length]}deg)`,
        top: `${tops[idx % tops.length]}%`,
        left: `${lefts[idx % lefts.length]}%`,
    };
  };

  // Trackpad / Mouse Wheel Horizontal Scroll Support
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
       scrollContainerRef.current.scrollLeft += e.deltaX;
    }
  };
  
  const getBackgroundStyle = () => {
      if (!post.backgroundConfig) {
          // Default green felt fallback for legacy mock posts
          return {
              className: 'bg-[#2a3b2a]',
              style: {}
          };
      }
      
      const config = post.backgroundConfig;
      if (config.type === 'image') {
          return {
              className: 'bg-gray-100 dark:bg-zinc-800',
              style: { backgroundImage: `url(${config.value})`, backgroundSize: 'cover' }
          };
      }
      return {
          className: config.value, // Tailwind classes like bg-white or patterns
          style: {}
      };
  };

  const bgStyle = getBackgroundStyle();

  return (
    <div 
        className="bg-white dark:bg-black border-b border-gray-100 dark:border-zinc-800 pb-0 outline-none mb-0 overscroll-x-contain touch-pan-y transition-colors duration-200 relative z-0"
        tabIndex={0}
        onKeyDown={(e) => {
            if (e.key === 'ArrowRight') scrollToIndex(1);
            if (e.key === 'ArrowLeft') scrollToIndex(0);
        }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={handleUserClick}>
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden border border-gray-200 dark:border-zinc-700">
            <img src={post.user.avatarUrl} alt={post.user.username} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm leading-tight text-black dark:text-white hover:underline">{post.user.username}</div>
            
            {/* Wearing / Music Info with Fade */}
            <div className={`text-[11px] text-gray-500 dark:text-zinc-400 font-light leading-tight mt-0.5 min-h-[14px] flex items-center gap-1 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                {post.music && infoState === 'music' ? (
                    <>
                        <Music size={10} strokeWidth={2.5} />
                        <span className="truncate max-w-[200px]">{post.music.title} • {post.music.artist}</span>
                    </>
                ) : (
                    brands && <span>Wearing {brands}</span>
                )}
            </div>

          </div>
        </div>
        <button 
            onClick={() => setShowOptions(true)}
            className="text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors p-2 -mr-2"
        >
            <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Content Carousel */}
      <div className="relative w-full aspect-square bg-gray-100 dark:bg-zinc-900 group">
        
        {/* Navigation Buttons (Manual Override for Swipe Issues) */}
        {activeSlide > 0 && (
            <button 
                onClick={(e) => { e.stopPropagation(); scrollToIndex(0); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-black/20 hover:bg-black/40 text-white rounded-full p-1.5 backdrop-blur-sm transition-all"
            >
                <ChevronLeft size={20} />
            </button>
        )}
        {activeSlide < 1 && (
            <button 
                onClick={(e) => { e.stopPropagation(); scrollToIndex(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-black/20 hover:bg-black/40 text-white rounded-full p-1.5 backdrop-blur-sm transition-all"
            >
                <ChevronRight size={20} />
            </button>
        )}

        <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onWheel={handleWheel}
            className="flex w-full h-full overflow-x-auto snap-x snap-mandatory hide-scrollbar overscroll-x-contain touch-pan-y"
        >
          {/* Slide 1: AI Generated Fit */}
          <div 
            className="w-full h-full flex-shrink-0 relative snap-center"
            onClick={handleImageClick}
            onDoubleClick={handleDoubleTap}
          >
            <img src={post.generatedImage} alt="Generated Fit" className="w-full h-full object-cover select-none" />
            
            {/* Tags Overlay */}
            {showTags && post.items.map((item, idx) => (
               <button
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(item);
                  }}
                  className="absolute bg-white text-black text-xs font-bold pl-3 pr-2 py-1.5 rounded-full flex items-center gap-1.5 shadow-xl animate-in fade-in zoom-in duration-200 active:scale-95 hover:bg-gray-50 z-10"
                  style={{ 
                    top: `${40 + (idx * 15)}%`, 
                    left: `${30 + (idx * 10)}%` 
                  }}
               >
                 <span>{item.brand}</span>
                 <ShoppingBag size={12} strokeWidth={3} className="text-black" />
               </button>
            ))}
          </div>

          {/* Slide 2: The Board */}
          <div className={`w-full h-full flex-shrink-0 relative overflow-hidden snap-center ${bgStyle.className}`} style={bgStyle.style}>
             {/* Legacy texture overlay if no specific config exists */}
             {!post.backgroundConfig && (
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/black-felt.png')]"></div>
             )}
             
             {post.items.map((item, idx) => {
                 // Use saved canvas state if available, else fallback to random polaroid positions
                 const style = item.canvasState 
                    ? {
                        top: `${item.canvasState.y}%`,
                        left: `${item.canvasState.x}%`,
                        width: '8rem', // Base width for canvas items
                        transform: `translate(-50%, -50%) rotate(${item.canvasState.rotation}deg) scale(${item.canvasState.scale || 1})`
                      }
                    : getPolaroidStyle(idx);
                 
                 // Legacy fallback styling logic
                 const isPolaroid = !item.canvasState;

                 return (
                     <div 
                        key={item.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(item);
                        }}
                        className={`absolute cursor-pointer transition-transform active:z-50 ${isPolaroid ? 'bg-white p-2 pb-6 shadow-2xl active:scale-110 w-32' : ''}`}
                        style={style}
                     >
                        <div className={`w-full aspect-square ${isPolaroid ? 'bg-gray-50 mb-2' : ''} overflow-hidden`}>
                            <img 
                                src={item.imageUrl} 
                                className={`w-full h-full object-contain pointer-events-none ${item.canvasState?.isBgRemoved || isPolaroid ? 'mix-blend-multiply' : ''}`} 
                                alt={item.name} 
                            />
                        </div>
                        {isPolaroid && <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-6 bg-white/40 backdrop-blur-[1px] rotate-1 shadow-sm pointer-events-none"></div>}
                     </div>
                 );
             })}
          </div>
        </div>

        {/* Action Buttons Overlay (Transparent Circles) */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
             {/* Like Button */}
             <button 
                onClick={handleLike} 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white transition-transform active:scale-95 hover:bg-black/50"
             >
                {isLiked ? <span className="text-xl">🔥</span> : <span className="text-xl grayscale opacity-50">🔥</span>}
             </button>

             {/* Comment Button */}
             <button 
                onClick={() => { setShowComments(true); setTimeout(() => commentInputRef.current?.focus(), 100); }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white transition-transform active:scale-95 hover:bg-black/50"
             >
                <MessageCircle size={20} strokeWidth={2} />
             </button>

             {/* Share Button */}
             <button 
                onClick={() => setShowShare(true)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white transition-transform active:scale-95 hover:bg-black/50"
             >
                <Send size={20} strokeWidth={2} className="-rotate-12 ml-0.5 mt-0.5" />
             </button>
          </div>

          {/* Carousel Indicators - Aligned with buttons */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1.5 bg-black/20 backdrop-blur-sm px-2 py-1.5 rounded-full pointer-events-none">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeSlide === 0 ? 'bg-white' : 'bg-white/50'}`} />
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeSlide === 1 ? 'bg-white' : 'bg-white/50'}`} />
          </div>

          {/* Tag Button */}
          <div className="pointer-events-auto">
              <button 
                onClick={() => setShowTags(!showTags)}
                className={`w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95 ${showTags ? 'bg-black/60' : 'bg-black/40 hover:bg-black/50'}`}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill={showTags ? "#16a34a" : "none"} 
                  stroke={showTags ? "#16a34a" : "white"} 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className={`transition-all`}
                >
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                  <path d="M7 7h.01" stroke="white" strokeWidth="3" />
                </svg>
              </button>
          </div>
        </div>
      </div>

      {/* Likes & Caption */}
      <div className="px-4 pb-4 pt-3">
        <div className="font-bold text-sm mb-1 text-black dark:text-white">{likesCount} flames</div>
        <div className="text-sm cursor-pointer active:opacity-70" onClick={() => onOpenFullView(post)}>
          <span className="font-bold mr-1 text-black dark:text-white hover:underline" onClick={(e) => { e.stopPropagation(); handleUserClick(e); }}>{post.user.username}</span>
          <span className="text-gray-900 dark:text-gray-200 leading-normal">{post.caption}</span>
        </div>
        <div className="text-gray-400 dark:text-zinc-500 text-xs mt-2 uppercase tracking-wide font-medium">
            <TimeAgo timestamp={post.createdAt} staticText={post.timestamp} />
        </div>
      </div>

      {/* Options Modal */}
      <Modal isOpen={showOptions} onClose={() => setShowOptions(false)} variant="bottom">
        <div className="flex flex-col gap-2 pb-8">
            <button 
                onClick={() => { setShowOptions(false); }}
                className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-2xl transition-colors text-left"
            >
                <UserPlus size={24} className="text-gray-900 dark:text-zinc-200" />
                <span className="font-bold text-sm text-gray-900 dark:text-zinc-200">Follow</span>
            </button>

            <button 
                onClick={() => { setIsSaved(!isSaved); setShowOptions(false); }}
                className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-2xl transition-colors text-left"
            >
                <Bookmark size={24} className={isSaved ? "fill-black dark:fill-white text-black dark:text-white" : "text-gray-900 dark:text-zinc-200"} />
                <span className="font-bold text-sm text-gray-900 dark:text-zinc-200">{isSaved ? "Unsave Post" : "Save Post"}</span>
            </button>
            
            <button 
                onClick={() => { alert("We'll show fewer posts like this."); setShowOptions(false); }}
                className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-2xl transition-colors text-left"
            >
                <EyeOff size={24} className="text-gray-900 dark:text-zinc-200" />
                <span className="font-bold text-sm text-gray-900 dark:text-zinc-200">See less like this</span>
            </button>
            
            <button 
                onClick={() => { alert("Report submitted. Thanks for keeping Fitted safe."); setShowOptions(false); }}
                className="w-full p-4 flex items-center gap-4 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-colors text-left text-red-600"
            >
                <Flag size={24} />
                <span className="font-bold text-sm">Report Post</span>
            </button>
        </div>
      </Modal>

      {/* COMMENTS MODAL */}
      <Modal isOpen={showComments} onClose={() => setShowComments(false)} variant="bottom" title="Comments">
        <div className="flex flex-col h-[50vh]">
            {/* List */}
            <div className="flex-1 overflow-y-auto pb-4 space-y-4 px-1">
                {comments.length === 0 && <div className="text-gray-400 text-center py-10 text-sm">No comments yet. Be the first.</div>}
                {comments.map(comment => (
                    <div key={comment.id} className="flex gap-3 items-start">
                        <img src={comment.avatarUrl} className="w-9 h-9 rounded-full object-cover border border-gray-100 dark:border-zinc-700 shrink-0 mt-1" alt={comment.username} />
                        <div className="flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="font-bold text-sm text-black dark:text-white">{comment.username}</span>
                                <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">
                                    <TimeAgo timestamp={comment.createdAt} staticText={comment.timestamp} />
                                </span>
                            </div>
                            <p className="text-sm text-gray-800 dark:text-zinc-300 leading-snug">{comment.text}</p>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 pt-1">
                            <button 
                                onClick={() => handleLikeComment(comment.id)}
                                className={`transition-transform active:scale-90 p-1 ${comment.isLiked ? 'text-red-500' : 'text-gray-400 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-400'}`}
                            >
                                <Heart size={14} fill={comment.isLiked ? "currentColor" : "none"} />
                            </button>
                            {/* Show like count text if > 0 */}
                            {comment.likes > 0 && (
                                <span className="text-[9px] text-gray-400 dark:text-zinc-500 font-medium leading-none">
                                    {comment.likes} like{comment.likes !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Input */}
            <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 flex items-center gap-3">
                <img src={CURRENT_USER.avatarUrl} className="w-8 h-8 rounded-full object-cover shrink-0" alt="me" />
                <div className="flex-1 relative">
                    <input 
                        ref={commentInputRef}
                        type="text" 
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                        placeholder={`Add a comment for ${post.user.username}...`}
                        className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full py-2.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white dark:text-white"
                    />
                    <button 
                        onClick={handlePostComment}
                        disabled={!newComment.trim()}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 font-bold text-xs hover:bg-blue-50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Post
                    </button>
                </div>
            </div>
        </div>
      </Modal>

      {/* SHARE MODAL */}
      <Modal isOpen={showShare} onClose={() => setShowShare(false)} variant="bottom" title="Share">
        <div className="flex flex-col gap-6 pb-6">
            
            {/* Internal Share (DMs) */}
            <div>
                <div className="relative mb-2">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Search users" className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl py-2 pl-9 pr-4 text-sm dark:text-white" />
                </div>
                
                <div className="flex gap-4 overflow-x-auto hide-scrollbar py-2">
                    {['steven', 'bloody', 'aleali', 'rocky', 'carti', 'kanye'].map((name, i) => (
                        <div key={i} className="flex flex-col items-center gap-1 min-w-[64px] cursor-pointer group">
                            <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden relative group-active:scale-95 transition-transform">
                                <img src={`https://picsum.photos/seed/${name}/200`} className="w-full h-full object-cover" alt={name} />
                            </div>
                            <span className="text-xs font-medium text-gray-600 dark:text-zinc-400 truncate w-full text-center">{name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-zinc-800 w-full" />

            {/* External Share */}
            <div className="grid grid-cols-4 gap-4">
                <button className="flex flex-col items-center gap-2 group" onClick={() => setShowShare(false)}>
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-200 group-active:scale-90 transition-transform">
                        <MessageIcon size={20} fill="currentColor" />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Message</span>
                </button>
                
                <button className="flex flex-col items-center gap-2 group" onClick={() => setShowShare(false)}>
                    <div className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-pink-200 group-active:scale-90 transition-transform">
                        <Instagram size={20} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Stories</span>
                </button>

                <button className="flex flex-col items-center gap-2 group" onClick={() => setShowShare(false)}>
                    <div className="w-12 h-12 bg-black dark:bg-white rounded-full flex items-center justify-center text-white dark:text-black shadow-lg shadow-gray-200 group-active:scale-90 transition-transform">
                        <Twitter size={20} fill="currentColor" />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">X / Twitter</span>
                </button>

                <button 
                    className="flex flex-col items-center gap-2 group" 
                    onClick={() => { navigator.clipboard.writeText("https://fitted.app/p/123"); setShowShare(false); alert("Link copied!"); }}
                >
                    <div className="w-12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-600 dark:text-zinc-400 group-active:scale-90 transition-transform">
                        <Copy size={20} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Copy Link</span>
                </button>
            </div>
        </div>
      </Modal>

      {/* Purchase Modal - Floating Center */}
      <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} variant="center">
        {selectedItem && (
          <div className="flex flex-col items-center text-center pb-2 text-black dark:text-white">
            <div className="w-48 h-48 bg-gray-50 dark:bg-white rounded-xl mb-4 p-4 border border-gray-100 dark:border-zinc-700 shadow-inner flex items-center justify-center">
              <img src={selectedItem.imageUrl} className="max-w-full max-h-full object-contain mix-blend-multiply" alt={selectedItem.name}/>
            </div>
            <h2 className="text-xl font-bold mb-0.5 font-serif text-black dark:text-white">{selectedItem.brand}</h2>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4 line-clamp-1">{selectedItem.name}</p>
            <div className="text-2xl font-black mb-6 text-black dark:text-white">${selectedItem.price}</div>
            
            <StoreButtonRow link={selectedItem.purchaseLink} itemName={selectedItem.name} />

            <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-3 font-medium uppercase tracking-wider">Tap to buy</span>
          </div>
        )}
      </Modal>
    </div>
  );
};